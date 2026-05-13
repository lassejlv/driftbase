use anyhow::{anyhow, Context, Result};
use driftbase_common::Id;
use driftbase_hetzner::{CreateServerRequest, HetznerClient};
use sea_orm::DatabaseConnection;
use serde_json::Value as JsonValue;
use std::time::Duration;

use crate::agent::tokens;
use crate::config::Config;
use crate::crypto::MasterKey;
use crate::edge::DEFAULT_SERVER_TYPE;

pub struct ProvisionEdgeInput<'a> {
    pub region_id: &'a str,
    pub region_name: &'a str,
    pub location: &'a str,
    pub server_type: &'a str,
}

pub struct ProvisionEdgeResult {
    pub edge_node_id: Id,
    pub hetzner_server_id: i64,
}

pub async fn provision(
    pool: &DatabaseConnection,
    config: &Config,
    master_key: &MasterKey,
    hetzner_token: &str,
    input: ProvisionEdgeInput<'_>,
) -> Result<ProvisionEdgeResult> {
    let server_type = if input.server_type.trim().is_empty() {
        DEFAULT_SERVER_TYPE
    } else {
        input.server_type.trim()
    };
    let client = HetznerClient::new(hetzner_token);
    let server_types = client
        .list_server_types()
        .await
        .context("listing Hetzner server types")?;
    let found = server_types
        .iter()
        .find(|t| t.name.eq_ignore_ascii_case(server_type))
        .ok_or_else(|| anyhow!("unknown Hetzner server type: {server_type}"))?;
    if !found.prices.iter().any(|p| p.location == input.location) {
        return Err(anyhow!(
            "server type {server_type} is not available in {}",
            input.location
        ));
    }

    let edge_node_id = Id::new();
    let bootstrap = tokens::mint_bootstrap(
        master_key,
        &edge_node_id.to_string(),
        crate::edge::TOKEN_WORKSPACE_ID,
    )
    .context("minting edge bootstrap token")?;
    let name = format!(
        "driftbase-edge-{}-{}",
        input.location,
        &edge_node_id.to_string()[..8]
    );
    let user_data = crate::provisioner::cloud_init::render_edge(
        &config.public_url,
        &bootstrap,
        &config.edge_image,
        &edge_node_id.to_string(),
    );

    crate::db::query(
        "INSERT INTO edge_nodes (id, region_id, name, provider, status, bootstrap_token_hash, \
                                hetzner_location, hetzner_server_type) \
         VALUES ($1, $2, $3, 'hetzner', 'provisioning', $4, $5, $6)",
    )
    .bind(edge_node_id.to_string())
    .bind(input.region_id)
    .bind(&name)
    .bind(tokens::fingerprint(&bootstrap))
    .bind(input.location)
    .bind(server_type)
    .execute(pool)
    .await?;

    let req = CreateServerRequest {
        name: &name,
        server_type,
        image: "debian-12",
        location: input.location,
        ssh_keys: Vec::new(),
        user_data: &user_data,
        start_after_create: true,
        labels: Some(hetzner_labels(
            input.region_id,
            &edge_node_id.to_string(),
            input.region_name,
        )),
    };

    let created = match client.create_server(&req).await {
        Ok(created) => created,
        Err(e) => {
            crate::db::query("DELETE FROM edge_nodes WHERE id = $1")
                .bind(edge_node_id.to_string())
                .execute(pool)
                .await
                .ok();
            return Err(anyhow!("hetzner create_server: {e}"));
        }
    };

    let public_ipv4 = created
        .server
        .public_net
        .ipv4
        .as_ref()
        .map(|v| v.ip.clone());
    crate::db::query(
        "UPDATE edge_nodes \
         SET hetzner_server_id = $1, public_ipv4 = $2, updated_at = now() \
         WHERE id = $3",
    )
    .bind(created.server.id)
    .bind(public_ipv4.as_deref())
    .bind(edge_node_id.to_string())
    .execute(pool)
    .await?;

    if created.action.id > 0 {
        let client_for_bg = client.clone();
        let action_id = created.action.id;
        tokio::spawn(async move {
            if let Err(e) = client_for_bg
                .wait_for_action(action_id, Duration::from_secs(120))
                .await
            {
                tracing::warn!(action = action_id, error = ?e, "hetzner edge create action");
            }
        });
    }

    Ok(ProvisionEdgeResult {
        edge_node_id,
        hetzner_server_id: created.server.id,
    })
}

pub async fn terminate(
    pool: &DatabaseConnection,
    hetzner_token: &str,
    edge_node_id: &str,
    hetzner_server_id: i64,
) -> Result<()> {
    crate::db::query(
        "UPDATE edge_nodes \
         SET status = 'terminated', node_token_hash = NULL, updated_at = now() \
         WHERE id = $1",
    )
    .bind(edge_node_id)
    .execute(pool)
    .await?;

    let client = HetznerClient::new(hetzner_token);
    client
        .delete_server(hetzner_server_id)
        .await
        .map_err(|e| anyhow!("hetzner delete_server: {e}"))?;
    Ok(())
}

fn hetzner_labels(region_id: &str, edge_node_id: &str, region_name: &str) -> JsonValue {
    JsonValue::Object(serde_json::Map::from_iter([
        (
            "driftbase.role".to_string(),
            JsonValue::String("edge".to_string()),
        ),
        (
            "driftbase.edge_region_id".to_string(),
            JsonValue::String(region_id.to_string()),
        ),
        (
            "driftbase.edge_node_id".to_string(),
            JsonValue::String(edge_node_id.to_string()),
        ),
        (
            "driftbase.edge_region".to_string(),
            JsonValue::String(region_name.to_string()),
        ),
    ]))
}
