use anyhow::{Context, Result};
use clap::Parser;
use driftbase_common::telemetry;
use std::path::PathBuf;
use std::time::Duration;

mod caddy;
mod client;
mod private_network;

use crate::client::{ControlPlaneClient, HeartbeatRequest, RegisterRequest};

#[derive(Parser, Debug)]
#[command(
    name = "driftbase-edge",
    version,
    about = "Driftbase global edge proxy"
)]
struct Args {
    #[arg(long, env = "DRIFTBASE_CONTROL_PLANE_URL")]
    control_plane_url: String,

    #[arg(long, env = "DRIFTBASE_EDGE_BOOTSTRAP_TOKEN")]
    bootstrap_token: Option<String>,

    #[arg(long, env = "DRIFTBASE_EDGE_NODE_TOKEN")]
    node_token: Option<String>,

    #[arg(long, env = "DRIFTBASE_EDGE_HOSTNAME")]
    hostname: Option<String>,

    #[arg(
        long,
        env = "DRIFTBASE_EDGE_POLL_INTERVAL_SECONDS",
        default_value_t = 10
    )]
    poll_interval_seconds: u64,

    #[arg(long, env = "DRIFTBASE_EDGE_NETWORK_DIR")]
    network_dir: Option<PathBuf>,

    #[arg(long, env = "DRIFTBASE_EDGE_CADDY_DIR")]
    caddy_dir: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    match dotenvy::dotenv() {
        Ok(path) => eprintln!("loaded env from {}", path.display()),
        Err(e) if e.not_found() => {}
        Err(e) => eprintln!("warning: could not load .env: {e}"),
    }
    telemetry::init("driftbase-edge");
    let args = Args::parse();

    let network_dir = args
        .network_dir
        .unwrap_or_else(private_network::default_network_dir);
    let caddy_dir = args.caddy_dir.unwrap_or_else(caddy::default_caddy_dir);
    let identity = private_network::load_or_create_identity(&network_dir)
        .await
        .context("loading edge WireGuard identity")?;
    let client = ControlPlaneClient::new(&args.control_plane_url);
    let hostname = args
        .hostname
        .clone()
        .unwrap_or_else(|| hostname().unwrap_or_else(|| "driftbase-edge".into()));

    let token = if let Some(token) = args.node_token.or_else(load_persisted_node_token) {
        tracing::info!("using persisted edge node token");
        token
    } else {
        let bootstrap = args
            .bootstrap_token
            .as_deref()
            .context("DRIFTBASE_EDGE_BOOTSTRAP_TOKEN or DRIFTBASE_EDGE_NODE_TOKEN is required")?;
        let resp = client
            .register(&RegisterRequest {
                bootstrap_token: bootstrap,
                hostname: &hostname,
                wireguard_public_key: &identity.public_key,
                wireguard_listen_port: identity.listen_port,
                agent_version: Some(env!("CARGO_PKG_VERSION")),
            })
            .await
            .context("registering edge node")?;
        tracing::info!(
            edge_node = %resp.edge_node_id,
            mesh_ip = %resp.wireguard_mesh_ip,
            "registered edge node"
        );
        persist_node_token(&resp.node_token).await?;
        resp.node_token
    };

    let mut caddy_child = caddy::start(&caddy_dir).await.context("starting caddy")?;
    let interval = Duration::from_secs(args.poll_interval_seconds.max(1));
    loop {
        if let Some(status) = caddy_child.try_wait().context("checking caddy status")? {
            tracing::warn!(?status, "caddy exited; restarting");
            caddy_child = caddy::start(&caddy_dir).await.context("restarting caddy")?;
        }

        let mut caddy_error: Option<String> = None;
        let mut network_error: Option<String> = None;
        let mut route_count = 0;

        match client.config(&token).await {
            Ok(config) => {
                tracing::debug!(
                    edge_node = %config.edge_node_id,
                    peers = config.peers.len(),
                    routes = config.routes.len(),
                    "received edge config"
                );
                route_count = config.routes.len() as i32;
                if let Err(e) =
                    private_network::sync(&network_dir, &config.interface, &config.peers).await
                {
                    network_error = Some(e.to_string());
                }
                if let Err(e) = caddy::apply_routes(&config.routes).await {
                    caddy_error = Some(e.to_string());
                }
            }
            Err(e) => {
                network_error = Some(format!("edge config fetch failed: {e}"));
            }
        }

        match client
            .heartbeat(
                &token,
                &HeartbeatRequest {
                    agent_version: Some(env!("CARGO_PKG_VERSION")),
                    route_count,
                    caddy_sync_error: caddy_error.as_deref(),
                    private_network_sync_error: network_error.as_deref(),
                },
            )
            .await
        {
            Ok(resp) => tracing::debug!(status = %resp.status, "edge heartbeat accepted"),
            Err(e) => tracing::warn!(error = ?e, "edge heartbeat failed"),
        }

        tokio::time::sleep(interval).await;
    }
}

fn hostname() -> Option<String> {
    std::env::var("HOSTNAME").ok().or_else(|| {
        std::fs::read_to_string("/etc/hostname")
            .ok()
            .map(|s| s.trim().into())
    })
}

fn token_path() -> PathBuf {
    std::env::var("DRIFTBASE_EDGE_NODE_TOKEN_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/etc/driftbase/edge-node-token"))
}

fn load_persisted_node_token() -> Option<String> {
    std::fs::read_to_string(token_path())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

async fn persist_node_token(token: &str) -> Result<()> {
    let path = token_path();
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&path, format!("{token}\n"))
        .await
        .with_context(|| format!("writing {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        tokio::fs::set_permissions(&path, perms)
            .await
            .with_context(|| format!("chmod 0600 {}", path.display()))?;
    }
    Ok(())
}
