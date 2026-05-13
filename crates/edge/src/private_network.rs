use anyhow::{anyhow, Context, Result};
use base64::Engine;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::client::{EdgeInterface, EdgePeer};

const PRIVATE_KEY_FILE: &str = "wg0.key";
const WG_CONFIG_FILE: &str = "wg0.conf";

#[derive(Debug, Clone)]
pub struct Identity {
    pub public_key: String,
    pub listen_port: i32,
}

pub async fn load_or_create_identity(dir: &Path) -> Result<Identity> {
    tokio::fs::create_dir_all(dir)
        .await
        .with_context(|| format!("creating {}", dir.display()))?;
    let private_key_path = dir.join(PRIVATE_KEY_FILE);
    let private_key = match tokio::fs::read_to_string(&private_key_path).await {
        Ok(key) => key,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let key = command_output("wg", &["genkey"]).await?;
            write_private_key(&private_key_path, key.trim()).await?;
            key
        }
        Err(e) => return Err(e).with_context(|| format!("reading {}", private_key_path.display())),
    };
    let public_key = wg_pubkey(private_key.trim()).await?;
    Ok(Identity {
        public_key,
        listen_port: 51820,
    })
}

pub async fn sync(dir: &Path, interface: &EdgeInterface, peers: &[EdgePeer]) -> Result<()> {
    tokio::fs::create_dir_all(dir)
        .await
        .with_context(|| format!("creating {}", dir.display()))?;
    validate_private_ip(&interface.address)?;
    for peer in peers {
        validate_public_key(&peer.public_key)?;
    }

    let private_key_path = dir.join(PRIVATE_KEY_FILE);
    let private_key = tokio::fs::read_to_string(&private_key_path)
        .await
        .with_context(|| format!("reading {}", private_key_path.display()))?;
    let config = render_wg_config(interface, peers, private_key.trim());
    let config_path = dir.join(WG_CONFIG_FILE);
    tokio::fs::write(&config_path, config)
        .await
        .with_context(|| format!("writing {}", config_path.display()))?;

    let _ = command_status("ip", &["link", "add", &interface.name, "type", "wireguard"]).await;
    command_status(
        "wg",
        &[
            "setconf",
            &interface.name,
            config_path.to_str().unwrap_or_default(),
        ],
    )
    .await?;
    let address = format!("{}/32", interface.address);
    command_status(
        "ip",
        &["address", "replace", &address, "dev", &interface.name],
    )
    .await?;
    command_status("ip", &["link", "set", "up", "dev", &interface.name]).await?;
    configure_forwarding().await?;

    for peer in peers {
        for allowed in &peer.allowed_ips {
            command_status("ip", &["route", "replace", allowed, "dev", &interface.name]).await?;
        }
    }
    Ok(())
}

pub fn render_wg_config(
    interface: &EdgeInterface,
    peers: &[EdgePeer],
    private_key: &str,
) -> String {
    let mut out = format!(
        "[Interface]\nPrivateKey = {private_key}\nListenPort = {}\n\n",
        interface.listen_port
    );
    for peer in peers {
        out.push_str(&format!("# {}\n", peer.node_id));
        out.push_str("[Peer]\n");
        out.push_str(&format!("PublicKey = {}\n", peer.public_key));
        out.push_str(&format!("Endpoint = {}\n", peer.endpoint));
        if !peer.allowed_ips.is_empty() {
            out.push_str(&format!("AllowedIPs = {}\n", peer.allowed_ips.join(", ")));
        }
        if let Some(keepalive) = peer.persistent_keepalive_seconds {
            out.push_str(&format!("PersistentKeepalive = {keepalive}\n"));
        }
        out.push('\n');
    }
    out
}

async fn write_private_key(path: &Path, key: &str) -> Result<()> {
    tokio::fs::write(path, format!("{key}\n"))
        .await
        .with_context(|| format!("writing {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        tokio::fs::set_permissions(path, perms)
            .await
            .with_context(|| format!("chmod 0600 {}", path.display()))?;
    }
    Ok(())
}

async fn wg_pubkey(private_key: &str) -> Result<String> {
    let mut child = Command::new("wg")
        .arg("pubkey")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .context("spawning wg pubkey")?;
    let mut stdin = child.stdin.take().context("opening wg pubkey stdin")?;
    stdin.write_all(private_key.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    drop(stdin);
    let out = child.wait_with_output().await?;
    if !out.status.success() {
        return Err(anyhow!(
            "wg pubkey failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

async fn configure_forwarding() -> Result<()> {
    let _ = command_status("sysctl", &["-w", "net.ipv4.ip_forward=1"]).await;
    ensure_iptables_rule(&["FORWARD", "-i", "wg0", "-j", "ACCEPT"]).await;
    ensure_iptables_rule(&["FORWARD", "-o", "wg0", "-j", "ACCEPT"]).await;
    Ok(())
}

async fn ensure_iptables_rule(args: &[&str]) {
    let check = Command::new("iptables").arg("-C").args(args).output().await;
    if matches!(check, Ok(out) if out.status.success()) {
        return;
    }
    let _ = Command::new("iptables").arg("-I").args(args).output().await;
}

async fn command_output(program: &str, args: &[&str]) -> Result<String> {
    let out = Command::new(program)
        .args(args)
        .output()
        .await
        .with_context(|| format!("spawning {program}"))?;
    if !out.status.success() {
        return Err(anyhow!(
            "command failed ({}): {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

async fn command_status(program: &str, args: &[&str]) -> Result<()> {
    let out = Command::new(program)
        .args(args)
        .output()
        .await
        .with_context(|| format!("spawning {program}"))?;
    if !out.status.success() {
        return Err(anyhow!(
            "command failed ({}): {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

fn validate_public_key(key: &str) -> Result<()> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(key)
        .map_err(|_| anyhow!("invalid peer public key"))?;
    if bytes.len() != 32 {
        return Err(anyhow!("invalid peer public key"));
    }
    Ok(())
}

fn validate_private_ip(ip: &str) -> Result<()> {
    let parsed: std::net::IpAddr = ip.parse().map_err(|e| anyhow!("bad interface IP: {e}"))?;
    if !parsed.is_ipv4() {
        return Err(anyhow!("edge mesh IP must be IPv4"));
    }
    Ok(())
}

pub fn default_network_dir() -> PathBuf {
    std::env::var("DRIFTBASE_EDGE_NETWORK_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/var/lib/driftbase/edge-network"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_edge_wireguard_peer() {
        let interface = EdgeInterface {
            name: "wg0".into(),
            address: "10.254.0.1".into(),
            listen_port: 51820,
        };
        let peer = EdgePeer {
            node_id: "node1".into(),
            public_key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=".into(),
            endpoint: "203.0.113.10:51820".into(),
            allowed_ips: vec!["10.255.0.1/32".into(), "10.64.1.0/24".into()],
            persistent_keepalive_seconds: Some(25),
        };
        let rendered = render_wg_config(&interface, &[peer], "private-key");
        assert!(rendered.contains("PrivateKey = private-key"));
        assert!(rendered.contains("Endpoint = 203.0.113.10:51820"));
        assert!(rendered.contains("AllowedIPs = 10.255.0.1/32, 10.64.1.0/24"));
    }
}
