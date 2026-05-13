use anyhow::{anyhow, Context, Result};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct ControlPlaneClient {
    http: reqwest::Client,
    base: String,
}

#[derive(Serialize)]
pub struct RegisterRequest<'a> {
    pub bootstrap_token: &'a str,
    pub hostname: &'a str,
    pub wireguard_public_key: &'a str,
    pub wireguard_listen_port: i32,
    pub agent_version: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterResponse {
    pub edge_node_id: String,
    pub node_token: String,
    pub wireguard_mesh_ip: String,
}

#[derive(Debug, Deserialize)]
pub struct EdgeConfig {
    pub edge_node_id: String,
    pub interface: EdgeInterface,
    #[serde(default)]
    pub peers: Vec<EdgePeer>,
    #[serde(default)]
    pub routes: Vec<EdgeRoute>,
}

#[derive(Debug, Deserialize)]
pub struct EdgeInterface {
    pub name: String,
    pub address: String,
    pub listen_port: i32,
}

#[derive(Debug, Deserialize)]
pub struct EdgePeer {
    pub node_id: String,
    pub public_key: String,
    pub endpoint: String,
    #[serde(default)]
    pub allowed_ips: Vec<String>,
    pub persistent_keepalive_seconds: Option<u16>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EdgeRoute {
    pub hostname: String,
    pub container_port: i32,
    pub deployment_id: String,
    pub upstream_host: String,
}

#[derive(Serialize)]
pub struct HeartbeatRequest<'a> {
    pub agent_version: Option<&'a str>,
    pub route_count: i32,
    pub caddy_sync_error: Option<&'a str>,
    pub private_network_sync_error: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
pub struct HeartbeatResponse {
    pub status: String,
}

impl ControlPlaneClient {
    pub fn new(base: &str) -> Self {
        Self {
            http: reqwest::Client::new(),
            base: base.trim_end_matches('/').to_string(),
        }
    }

    pub async fn register(&self, req: &RegisterRequest<'_>) -> Result<RegisterResponse> {
        self.post_json("/api/v1/edge/register", None, req).await
    }

    pub async fn config(&self, node_token: &str) -> Result<EdgeConfig> {
        let res = self
            .http
            .get(format!("{}/api/v1/edge/config", self.base))
            .bearer_auth(node_token)
            .send()
            .await
            .context("GET /edge/config")?;
        parse(res).await
    }

    pub async fn heartbeat(
        &self,
        node_token: &str,
        req: &HeartbeatRequest<'_>,
    ) -> Result<HeartbeatResponse> {
        self.post_json("/api/v1/edge/heartbeat", Some(node_token), req)
            .await
    }

    async fn post_json<T, R>(&self, path: &str, bearer: Option<&str>, body: &T) -> Result<R>
    where
        T: Serialize + ?Sized,
        R: for<'de> Deserialize<'de>,
    {
        let mut req = self.http.post(format!("{}{}", self.base, path)).json(body);
        if let Some(token) = bearer {
            req = req.bearer_auth(token);
        }
        let res = req.send().await.with_context(|| format!("POST {path}"))?;
        parse(res).await
    }
}

async fn parse<T: for<'de> Deserialize<'de>>(res: reqwest::Response) -> Result<T> {
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        if status == StatusCode::UNAUTHORIZED {
            return Err(anyhow!("control plane rejected edge token"));
        }
        return Err(anyhow!("control plane error {status}: {text}"));
    }
    serde_json::from_str(&text).with_context(|| format!("decoding control plane response: {text}"))
}
