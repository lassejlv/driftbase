use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value as JsonValue};
use std::path::{Path, PathBuf};
use tokio::process::{Child, Command};
use tokio::time::{sleep, Duration};

use crate::client::EdgeRoute;

const CADDY_ADMIN_URL: &str = "http://127.0.0.1:2019";

pub async fn start(caddy_dir: &Path) -> Result<Child> {
    tokio::fs::create_dir_all(caddy_dir)
        .await
        .with_context(|| format!("creating {}", caddy_dir.display()))?;
    let bootstrap_path = caddy_dir.join("bootstrap.json");
    tokio::fs::write(&bootstrap_path, serde_json::to_vec(&build_config(&[]))?)
        .await
        .with_context(|| format!("writing {}", bootstrap_path.display()))?;

    let child = Command::new("caddy")
        .arg("run")
        .arg("--config")
        .arg(&bootstrap_path)
        .arg("--resume")
        .spawn()
        .context("starting caddy")?;

    sleep(Duration::from_millis(500)).await;
    Ok(child)
}

pub async fn apply_routes(routes: &[EdgeRoute]) -> Result<()> {
    let cfg = build_config(routes);
    let res = reqwest::Client::new()
        .post(format!("{CADDY_ADMIN_URL}/load"))
        .json(&cfg)
        .send()
        .await
        .context("POSTing to caddy admin /load")?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(anyhow!("caddy /load: {status}: {body}"));
    }
    Ok(())
}

pub fn build_config(routes: &[EdgeRoute]) -> JsonValue {
    let routes_json = routes
        .iter()
        .map(|route| {
            json!({
                "match": [{ "host": [route.hostname] }],
                "handle": [{
                    "handler": "reverse_proxy",
                    "upstreams": [{
                        "dial": format!("{}:{}", route.upstream_host, route.container_port)
                    }],
                    "flush_interval": -1,
                }],
                "terminal": true,
            })
        })
        .collect::<Vec<_>>();

    json!({
        "admin": { "listen": "127.0.0.1:2019" },
        "apps": {
            "http": {
                "servers": {
                    "driftbase_edge": {
                        "listen": [":443", ":80"],
                        "routes": routes_json,
                        "automatic_https": {
                            "disable_redirects": false
                        }
                    }
                }
            }
        }
    })
}

pub fn default_caddy_dir() -> PathBuf {
    std::env::var("DRIFTBASE_EDGE_CADDY_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/var/lib/driftbase/edge-caddy"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caddy_config_maps_hosts_to_private_upstreams() {
        let cfg = build_config(&[EdgeRoute {
            hostname: "api.example.com".into(),
            container_port: 8080,
            deployment_id: "dep".into(),
            upstream_host: "10.64.1.10".into(),
        }]);
        let route = &cfg["apps"]["http"]["servers"]["driftbase_edge"]["routes"][0];
        assert_eq!(route["match"][0]["host"][0], "api.example.com");
        assert_eq!(
            route["handle"][0]["upstreams"][0]["dial"],
            "10.64.1.10:8080"
        );
    }
}
