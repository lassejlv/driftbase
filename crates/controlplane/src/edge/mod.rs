pub mod provisioner;
pub mod routes;

use anyhow::{anyhow, Result};
use sea_orm::DatabaseConnection;

pub const TOKEN_WORKSPACE_ID: &str = "edge";
pub const DEFAULT_SERVER_TYPE: &str = "cx22";
const EDGE_MESH_SECOND_OCTET: u8 = 254;

#[derive(Debug, Clone, sea_orm::FromQueryResult)]
pub struct EdgePeer {
    pub id: String,
    pub public_ipv4: Option<String>,
    pub wireguard_public_key: Option<String>,
    pub wireguard_mesh_ip: Option<String>,
    pub wireguard_listen_port: i32,
}

#[derive(Debug, Clone, sea_orm::FromQueryResult)]
pub struct EdgeRoute {
    pub hostname: String,
    pub container_port: i32,
    pub deployment_id: String,
    pub upstream_host: String,
}

pub async fn ready_peers(pool: &DatabaseConnection) -> Result<Vec<EdgePeer>> {
    let rows = crate::db::query_as::<EdgePeer>(
        "SELECT id, public_ipv4, wireguard_public_key, wireguard_mesh_ip, wireguard_listen_port \
         FROM edge_nodes \
         WHERE status = 'ready' \
           AND public_ipv4 IS NOT NULL \
           AND wireguard_public_key IS NOT NULL \
           AND wireguard_mesh_ip IS NOT NULL \
         ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn public_ips(pool: &DatabaseConnection) -> Result<Vec<String>> {
    let rows: Vec<(String,)> = crate::db::query_tuple(
        "SELECT public_ipv4 \
         FROM edge_nodes \
         WHERE status = 'ready' AND public_ipv4 IS NOT NULL \
         ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(ip,)| ip).collect())
}

pub async fn active_routes(pool: &DatabaseConnection) -> Result<Vec<EdgeRoute>> {
    let rows = crate::db::query_as::<EdgeRoute>(
        "SELECT sd.hostname, sd.container_port, active.id AS deployment_id, \
                active.private_ipv4 AS upstream_host \
         FROM service_domains sd \
         JOIN services s ON s.id = sd.service_id \
         JOIN LATERAL ( \
             SELECT d.id, d.private_ipv4 \
             FROM deployments d \
             WHERE d.service_id = s.id \
               AND d.status = 'running' \
               AND d.private_ipv4 IS NOT NULL \
             ORDER BY d.updated_at DESC \
             LIMIT 1 \
         ) active ON TRUE \
         ORDER BY sd.hostname ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn route_count(pool: &DatabaseConnection) -> Result<i64> {
    let (count,): (i64,) = crate::db::query_tuple(
        "SELECT COUNT(*)::bigint \
         FROM service_domains sd \
         JOIN services s ON s.id = sd.service_id \
         WHERE EXISTS ( \
             SELECT 1 FROM deployments d \
             WHERE d.service_id = s.id \
               AND d.status = 'running' \
               AND d.private_ipv4 IS NOT NULL \
         )",
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

pub async fn assign_mesh_ip(pool: &DatabaseConnection, edge_node_id: &str) -> Result<String> {
    if let Some((Some(ip),)) = crate::db::query_tuple::<(Option<String>,)>(
        "SELECT wireguard_mesh_ip FROM edge_nodes WHERE id = $1",
    )
    .bind(edge_node_id)
    .fetch_optional(pool)
    .await?
    {
        return Ok(ip);
    }

    let used: Vec<(String,)> = crate::db::query_tuple(
        "SELECT wireguard_mesh_ip FROM edge_nodes WHERE wireguard_mesh_ip IS NOT NULL",
    )
    .fetch_all(pool)
    .await?;
    let used = used
        .into_iter()
        .map(|(ip,)| ip)
        .collect::<std::collections::BTreeSet<_>>();

    for idx in 1..=65_000u32 {
        let ip = edge_mesh_ip_for_index(idx);
        if used.contains(&ip) {
            continue;
        }
        let res = crate::db::query(
            "UPDATE edge_nodes \
             SET wireguard_mesh_ip = COALESCE(wireguard_mesh_ip, $1), \
                 updated_at = now() \
             WHERE id = $2",
        )
        .bind(&ip)
        .bind(edge_node_id)
        .execute(pool)
        .await;
        match res {
            Ok(_) => return Ok(ip),
            Err(e) if crate::db::is_unique_violation(&e) => continue,
            Err(e) => return Err(e.into()),
        }
    }

    Err(anyhow!("edge WireGuard mesh IP pool exhausted"))
}

fn edge_mesh_ip_for_index(idx: u32) -> String {
    let host = ((idx - 1) % 254) + 1;
    let third = ((idx - 1) / 254) % 256;
    format!("10.{EDGE_MESH_SECOND_OCTET}.{third}.{host}")
}

#[cfg(test)]
mod tests {
    use super::edge_mesh_ip_for_index;

    #[test]
    fn edge_mesh_pool_is_separate_from_runtime_nodes() {
        assert_eq!(edge_mesh_ip_for_index(1), "10.254.0.1");
        assert_eq!(edge_mesh_ip_for_index(255), "10.254.1.1");
    }
}
