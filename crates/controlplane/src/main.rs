use std::net::SocketAddr;

use anyhow::{Context, Result};
use axum::{routing::get, Json, Router};
use clap::Parser;
use serde::Serialize;
use zediz_common::telemetry;

#[derive(Parser, Debug)]
#[command(name = "zediz-controlplane", version, about = "Zediz control plane")]
struct Args {
    #[arg(long, env = "ZEDIZ_BIND_ADDR", default_value = "0.0.0.0:8080")]
    bind: SocketAddr,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
}

#[tokio::main]
async fn main() -> Result<()> {
    telemetry::init("zediz-controlplane");
    let args = Args::parse();

    let app = Router::new().route(
        "/healthz",
        get(|| async {
            Json(Health {
                status: "ok",
                version: env!("CARGO_PKG_VERSION"),
            })
        }),
    );

    let listener = tokio::net::TcpListener::bind(args.bind)
        .await
        .with_context(|| format!("binding {}", args.bind))?;
    tracing::info!(addr = %args.bind, "control plane listening");
    axum::serve(listener, app).await?;
    Ok(())
}
