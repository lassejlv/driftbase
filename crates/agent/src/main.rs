use anyhow::Result;
use clap::Parser;
use zediz_common::telemetry;

#[derive(Parser, Debug)]
#[command(name = "zediz-agent", version, about = "Zediz node agent")]
struct Args {
    /// URL of the control plane (e.g. https://cp.zediz.example)
    #[arg(long, env = "ZEDIZ_CONTROL_PLANE_URL")]
    control_plane_url: String,

    /// One-shot bootstrap token issued by the control plane at provision time.
    #[arg(long, env = "ZEDIZ_BOOTSTRAP_TOKEN")]
    bootstrap_token: Option<String>,

    /// Persistent node token (replaces bootstrap after first register).
    #[arg(long, env = "ZEDIZ_NODE_TOKEN")]
    node_token: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    telemetry::init("zediz-agent");
    let args = Args::parse();

    tracing::info!(cp = %args.control_plane_url, "agent starting");
    // TODO (phase 3): register with CP, open WS, reconcile loop.
    Ok(())
}
