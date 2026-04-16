use std::net::SocketAddr;

use anyhow::{anyhow, Context, Result};

use crate::crypto::MasterKey;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub public_url: String,
    pub cookie_secure: bool,
}

pub struct LoadedConfig {
    pub config: Config,
    pub master_key: MasterKey,
}

impl Config {
    pub fn from_env() -> Result<LoadedConfig> {
        let bind_addr = std::env::var("ZEDIZ_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8080".into())
            .parse()
            .context("ZEDIZ_BIND_ADDR")?;
        let database_url = std::env::var("ZEDIZ_DATABASE_URL")
            .map_err(|_| anyhow!("ZEDIZ_DATABASE_URL is required"))?;
        let public_url =
            std::env::var("ZEDIZ_PUBLIC_URL").unwrap_or_else(|_| "http://localhost:8080".into());
        let cookie_secure = std::env::var("ZEDIZ_COOKIE_SECURE")
            .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);

        let master_key_raw = std::env::var("ZEDIZ_MASTER_KEY")
            .map_err(|_| anyhow!("ZEDIZ_MASTER_KEY is required (base64 of 32 bytes)"))?;
        let master_key =
            MasterKey::from_base64(&master_key_raw).context("loading ZEDIZ_MASTER_KEY")?;

        Ok(LoadedConfig {
            config: Self {
                bind_addr,
                database_url,
                public_url,
                cookie_secure,
            },
            master_key,
        })
    }
}
