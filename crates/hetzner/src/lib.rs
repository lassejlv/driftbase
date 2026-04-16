use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;

const API_BASE: &str = "https://api.hetzner.cloud/v1";

#[derive(Debug, Error)]
pub enum HetznerError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("api error {status}: {message}")]
    Api { status: u16, message: String },
}

#[derive(Clone)]
pub struct HetznerClient {
    http: Client,
    token: String,
}

impl HetznerClient {
    pub fn new(token: impl Into<String>) -> Self {
        Self {
            http: Client::builder()
                .user_agent(concat!("zediz/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("reqwest client"),
            token: token.into(),
        }
    }

    /// Validates the token by calling a cheap endpoint.
    pub async fn ping(&self) -> Result<(), HetznerError> {
        let res = self
            .http
            .get(format!("{API_BASE}/server_types?per_page=1"))
            .bearer_auth(&self.token)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let message = res.text().await.unwrap_or_default();
            return Err(HetznerError::Api { status, message });
        }
        Ok(())
    }
}

// Minimal shapes — expand as we build out the provisioner.
#[derive(Debug, Serialize, Deserialize)]
pub struct ServerType {
    pub id: i64,
    pub name: String,
    pub cores: u32,
    pub memory: f32,
    pub disk: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Location {
    pub id: i64,
    pub name: String,
    pub country: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SshKey {
    pub id: i64,
    pub name: String,
    pub fingerprint: String,
    pub public_key: String,
}
