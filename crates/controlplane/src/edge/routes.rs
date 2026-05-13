use anyhow::Context;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::routing::{delete as delete_route, get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use driftbase_common::Id;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::agent::tokens::{self, TokenKind};
use crate::auth::AuthUser;
use crate::edge::{self, provisioner};
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/admin/edge/regions",
            get(admin_list).post(admin_create_region),
        )
        .route(
            "/admin/edge/regions/:id/disable",
            post(admin_disable_region),
        )
        .route("/admin/edge/nodes/:id/drain", post(admin_drain_node))
        .route("/admin/edge/nodes/:id", delete_route(admin_delete_node))
        .route("/edge/register", post(register))
        .route("/edge/heartbeat", post(heartbeat))
        .route("/edge/config", get(config))
}

#[derive(Serialize)]
struct AdminEdgeOverview {
    edge_hostname: String,
    edge_ips: Vec<String>,
    route_count: i64,
    regions: Vec<AdminEdgeRegion>,
}

#[derive(Serialize)]
struct AdminEdgeRegion {
    id: String,
    name: String,
    provider: String,
    location: String,
    server_type: String,
    desired_nodes: i32,
    status: String,
    created_at: DateTime<Utc>,
    nodes: Vec<AdminEdgeNode>,
}

#[derive(Serialize, sea_orm::FromQueryResult)]
struct AdminEdgeNode {
    id: String,
    region_id: String,
    name: String,
    provider: String,
    status: String,
    public_ipv4: Option<String>,
    hetzner_location: Option<String>,
    hetzner_server_type: Option<String>,
    wireguard_mesh_ip: Option<String>,
    agent_version: Option<String>,
    route_count: i32,
    caddy_synced_at: Option<DateTime<Utc>>,
    caddy_sync_error: Option<String>,
    private_network_synced_at: Option<DateTime<Utc>>,
    private_network_sync_error: Option<String>,
    last_error: Option<String>,
    last_seen_at: Option<DateTime<Utc>>,
    registered_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

#[derive(sea_orm::FromQueryResult)]
struct RegionRow {
    id: String,
    name: String,
    provider: String,
    location: String,
    server_type: String,
    desired_nodes: i32,
    status: String,
    created_at: DateTime<Utc>,
}

async fn admin_list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<AdminEdgeOverview>> {
    crate::admin::require_platform_admin(state.pool(), &auth.user_id).await?;

    let regions: Vec<RegionRow> = crate::db::query_as(
        "SELECT id, name, provider, location, server_type, desired_nodes, status, created_at \
         FROM edge_regions \
         ORDER BY created_at ASC",
    )
    .fetch_all(state.pool())
    .await?;
    let nodes: Vec<AdminEdgeNode> = crate::db::query_as(
        "SELECT id, region_id, name, provider, status, public_ipv4, hetzner_location, \
                hetzner_server_type, wireguard_mesh_ip, agent_version, route_count, \
                caddy_synced_at, caddy_sync_error, private_network_synced_at, \
                private_network_sync_error, last_error, last_seen_at, registered_at, created_at \
         FROM edge_nodes \
         WHERE status <> 'terminated' \
         ORDER BY created_at ASC",
    )
    .fetch_all(state.pool())
    .await?;
    let mut nodes_by_region = BTreeMap::<String, Vec<AdminEdgeNode>>::new();
    for node in nodes {
        nodes_by_region
            .entry(node.region_id.clone())
            .or_default()
            .push(node);
    }

    let regions = regions
        .into_iter()
        .map(|r| AdminEdgeRegion {
            id: r.id.clone(),
            name: r.name,
            provider: r.provider,
            location: r.location,
            server_type: r.server_type,
            desired_nodes: r.desired_nodes,
            status: r.status,
            created_at: r.created_at,
            nodes: nodes_by_region.remove(&r.id).unwrap_or_default(),
        })
        .collect();

    Ok(Json(AdminEdgeOverview {
        edge_hostname: state.config().edge_public_hostname.clone(),
        edge_ips: edge::public_ips(state.pool())
            .await
            .map_err(ApiError::Internal)?,
        route_count: edge::route_count(state.pool())
            .await
            .map_err(ApiError::Internal)?,
        regions,
    }))
}

#[derive(Deserialize)]
struct CreateRegionRequest {
    name: Option<String>,
    location: String,
    server_type: Option<String>,
}

#[derive(Serialize)]
struct CreateRegionResponse {
    region_id: String,
    edge_node_id: String,
    hetzner_server_id: i64,
}

async fn admin_create_region(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateRegionRequest>,
) -> ApiResult<Json<CreateRegionResponse>> {
    crate::admin::require_platform_admin(state.pool(), &auth.user_id).await?;
    let token = state
        .config()
        .managed_hetzner_api_token
        .clone()
        .ok_or_else(|| {
            ApiError::Validation(
                "DRIFTBASE_MANAGED_HETZNER_API_TOKEN is required to deploy edge regions".into(),
            )
        })?;

    let location = req.location.trim().to_ascii_lowercase();
    if location.is_empty() {
        return Err(ApiError::Validation("location is required".into()));
    }
    let name = req
        .name
        .unwrap_or_else(|| location.clone())
        .trim()
        .to_ascii_lowercase();
    if name.is_empty() {
        return Err(ApiError::Validation("name is required".into()));
    }
    let server_type = req
        .server_type
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(edge::DEFAULT_SERVER_TYPE)
        .to_string();

    let region_id = Id::new().to_string();
    let inserted: Option<(String,)> = crate::db::query_tuple(
        "INSERT INTO edge_regions (id, name, provider, location, server_type, desired_nodes) \
         VALUES ($1, $2, 'hetzner', $3, $4, 1) \
         ON CONFLICT (name) DO NOTHING \
         RETURNING id",
    )
    .bind(&region_id)
    .bind(&name)
    .bind(&location)
    .bind(&server_type)
    .fetch_optional(state.pool())
    .await?;
    inserted.ok_or_else(|| ApiError::Conflict("edge region name already exists".into()))?;

    let result = match provisioner::provision(
        state.pool(),
        state.config(),
        state.master_key(),
        &token,
        provisioner::ProvisionEdgeInput {
            region_id: &region_id,
            region_name: &name,
            location: &location,
            server_type: &server_type,
        },
    )
    .await
    {
        Ok(result) => result,
        Err(err) => {
            crate::db::query("DELETE FROM edge_regions WHERE id = $1")
                .bind(&region_id)
                .execute(state.pool())
                .await
                .ok();
            return Err(ApiError::Internal(err));
        }
    };

    Ok(Json(CreateRegionResponse {
        region_id,
        edge_node_id: result.edge_node_id.to_string(),
        hetzner_server_id: result.hetzner_server_id,
    }))
}

async fn admin_disable_region(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(region_id): Path<String>,
) -> ApiResult<()> {
    crate::admin::require_platform_admin(state.pool(), &auth.user_id).await?;
    crate::db::query(
        "UPDATE edge_regions SET status = 'disabled', updated_at = now() WHERE id = $1",
    )
    .bind(&region_id)
    .execute(state.pool())
    .await?;
    crate::db::query(
        "UPDATE edge_nodes \
         SET status = CASE WHEN status = 'terminated' THEN status ELSE 'draining' END, \
             updated_at = now() \
         WHERE region_id = $1",
    )
    .bind(&region_id)
    .execute(state.pool())
    .await?;
    crate::private_network::sync_all_workspaces(state.pool())
        .await
        .map_err(ApiError::Internal)?;
    Ok(())
}

async fn admin_drain_node(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(edge_node_id): Path<String>,
) -> ApiResult<()> {
    crate::admin::require_platform_admin(state.pool(), &auth.user_id).await?;
    crate::db::query(
        "UPDATE edge_nodes \
         SET status = 'draining', updated_at = now() \
         WHERE id = $1 AND status <> 'terminated'",
    )
    .bind(&edge_node_id)
    .execute(state.pool())
    .await?;
    crate::private_network::sync_all_workspaces(state.pool())
        .await
        .map_err(ApiError::Internal)?;
    Ok(())
}

#[derive(Deserialize, Default)]
struct DeleteNodeRequest {
    #[serde(default)]
    force: Option<bool>,
}

async fn admin_delete_node(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(edge_node_id): Path<String>,
    axum::extract::Query(req): axum::extract::Query<DeleteNodeRequest>,
) -> ApiResult<()> {
    crate::admin::require_platform_admin(state.pool(), &auth.user_id).await?;
    if !req.force.unwrap_or(false) {
        return Err(ApiError::Conflict(
            "edge node deletion requires force=true".into(),
        ));
    }

    let node: Option<(String, Option<i64>)> =
        crate::db::query_tuple("SELECT provider, hetzner_server_id FROM edge_nodes WHERE id = $1")
            .bind(&edge_node_id)
            .fetch_optional(state.pool())
            .await?;
    let Some((provider, hetzner_server_id)) = node else {
        return Err(ApiError::NotFound);
    };

    if let ("hetzner", Some(server_id)) = (provider.as_str(), hetzner_server_id) {
        let token = state
            .config()
            .managed_hetzner_api_token
            .clone()
            .ok_or_else(|| {
                ApiError::Validation(
                    "DRIFTBASE_MANAGED_HETZNER_API_TOKEN is required to delete edge nodes".into(),
                )
            })?;
        provisioner::terminate(state.pool(), &token, &edge_node_id, server_id)
            .await
            .map_err(ApiError::Internal)?;
    } else {
        crate::db::query(
            "UPDATE edge_nodes \
             SET status = 'terminated', node_token_hash = NULL, updated_at = now() \
             WHERE id = $1",
        )
        .bind(&edge_node_id)
        .execute(state.pool())
        .await?;
    }

    crate::private_network::sync_all_workspaces(state.pool())
        .await
        .map_err(ApiError::Internal)?;
    Ok(())
}

#[derive(Deserialize)]
struct RegisterRequest {
    bootstrap_token: String,
    hostname: String,
    wireguard_public_key: String,
    wireguard_listen_port: i32,
    agent_version: Option<String>,
}

#[derive(Serialize)]
struct RegisterResponse {
    edge_node_id: String,
    node_token: String,
    wireguard_mesh_ip: String,
}

async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> ApiResult<Json<RegisterResponse>> {
    let claims = tokens::verify(
        state.master_key(),
        &req.bootstrap_token,
        TokenKind::Bootstrap,
    )
    .map_err(|_| ApiError::Unauthorized)?;
    if claims.workspace_id != edge::TOKEN_WORKSPACE_ID {
        return Err(ApiError::Unauthorized);
    }

    let row: Option<(Option<String>, String)> =
        crate::db::query_tuple("SELECT bootstrap_token_hash, status FROM edge_nodes WHERE id = $1")
            .bind(&claims.node_id)
            .fetch_optional(state.pool())
            .await?;
    let Some((stored_hash, status)) = row else {
        return Err(ApiError::Unauthorized);
    };
    if status == "terminated" {
        return Err(ApiError::Unauthorized);
    }
    if stored_hash.as_deref() != Some(&tokens::fingerprint(&req.bootstrap_token)) {
        return Err(ApiError::Unauthorized);
    }

    validate_wireguard_public_key(&req.wireguard_public_key)?;
    if !(1..=65535).contains(&req.wireguard_listen_port) {
        return Err(ApiError::Validation(
            "wireguard_listen_port out of range".into(),
        ));
    }

    let mesh_ip = edge::assign_mesh_ip(state.pool(), &claims.node_id)
        .await
        .map_err(ApiError::Internal)?;
    let node_token = tokens::mint_node(
        state.master_key(),
        &claims.node_id,
        edge::TOKEN_WORKSPACE_ID,
    )
    .context("minting edge node token")
    .map_err(ApiError::Internal)?;
    crate::db::query(
        "UPDATE edge_nodes SET \
            name = $1, status = 'ready', bootstrap_token_hash = NULL, node_token_hash = $2, \
            wireguard_public_key = $3, wireguard_mesh_ip = $4, wireguard_listen_port = $5, \
            agent_version = $6, registered_at = COALESCE(registered_at, now()), \
            last_seen_at = now(), last_error = NULL, updated_at = now() \
         WHERE id = $7",
    )
    .bind(req.hostname.trim())
    .bind(tokens::fingerprint(&node_token))
    .bind(&req.wireguard_public_key)
    .bind(&mesh_ip)
    .bind(req.wireguard_listen_port)
    .bind(req.agent_version.as_deref())
    .bind(&claims.node_id)
    .execute(state.pool())
    .await?;

    crate::private_network::sync_all_workspaces(state.pool())
        .await
        .map_err(ApiError::Internal)?;

    Ok(Json(RegisterResponse {
        edge_node_id: claims.node_id,
        node_token,
        wireguard_mesh_ip: mesh_ip,
    }))
}

#[derive(Deserialize)]
struct HeartbeatRequest {
    agent_version: Option<String>,
    route_count: i32,
    caddy_sync_error: Option<String>,
    private_network_sync_error: Option<String>,
}

#[derive(Serialize)]
struct HeartbeatResponse {
    status: String,
}

async fn heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<HeartbeatRequest>,
) -> ApiResult<Json<HeartbeatResponse>> {
    let edge_node_id = authenticate_edge(state.pool(), state.master_key(), &headers).await?;
    let status = edge_status(state.pool(), &edge_node_id).await?;
    if status == "terminated" {
        return Err(ApiError::Unauthorized);
    }
    crate::db::query(
        "UPDATE edge_nodes SET \
            agent_version = COALESCE($1, agent_version), route_count = GREATEST($2, 0), \
            caddy_synced_at = CASE WHEN $3::text IS NULL THEN now() ELSE caddy_synced_at END, \
            caddy_sync_error = $3, \
            private_network_synced_at = CASE WHEN $4::text IS NULL THEN now() ELSE private_network_synced_at END, \
            private_network_sync_error = $4, \
            last_seen_at = now(), updated_at = now() \
         WHERE id = $5",
    )
    .bind(req.agent_version.as_deref())
    .bind(req.route_count)
    .bind(req.caddy_sync_error.as_deref())
    .bind(req.private_network_sync_error.as_deref())
    .bind(&edge_node_id)
    .execute(state.pool())
    .await?;
    Ok(Json(HeartbeatResponse { status }))
}

#[derive(Serialize)]
struct EdgeConfig {
    edge_node_id: String,
    interface: EdgeInterface,
    peers: Vec<EdgePeerConfig>,
    routes: Vec<EdgeRouteConfig>,
}

#[derive(Serialize)]
struct EdgeInterface {
    name: &'static str,
    address: String,
    listen_port: i32,
}

#[derive(Serialize)]
struct EdgePeerConfig {
    node_id: String,
    public_key: String,
    endpoint: String,
    allowed_ips: Vec<String>,
    persistent_keepalive_seconds: u16,
}

#[derive(Serialize)]
struct EdgeRouteConfig {
    hostname: String,
    container_port: i32,
    deployment_id: String,
    upstream_host: String,
}

async fn config(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<EdgeConfig>> {
    let edge_node_id = authenticate_edge(state.pool(), state.master_key(), &headers).await?;
    let node: Option<(String, i32, String)> = crate::db::query_tuple(
        "SELECT wireguard_mesh_ip, wireguard_listen_port, status \
         FROM edge_nodes WHERE id = $1",
    )
    .bind(&edge_node_id)
    .fetch_optional(state.pool())
    .await?;
    let Some((mesh_ip, listen_port, status)) = node else {
        return Err(ApiError::Unauthorized);
    };
    if status != "ready" {
        return Ok(Json(EdgeConfig {
            edge_node_id,
            interface: EdgeInterface {
                name: "wg0",
                address: mesh_ip,
                listen_port,
            },
            peers: Vec::new(),
            routes: Vec::new(),
        }));
    }

    let peers = runtime_peers(state.pool()).await?;
    let routes = edge::active_routes(state.pool())
        .await
        .map_err(ApiError::Internal)?
        .into_iter()
        .map(|r| EdgeRouteConfig {
            hostname: r.hostname,
            container_port: r.container_port,
            deployment_id: r.deployment_id,
            upstream_host: r.upstream_host,
        })
        .collect();
    Ok(Json(EdgeConfig {
        edge_node_id,
        interface: EdgeInterface {
            name: "wg0",
            address: mesh_ip,
            listen_port,
        },
        peers,
        routes,
    }))
}

async fn authenticate_edge(
    pool: &DatabaseConnection,
    master_key: &crate::crypto::MasterKey,
    headers: &HeaderMap,
) -> ApiResult<String> {
    let token = bearer(headers).ok_or(ApiError::Unauthorized)?;
    let claims =
        tokens::verify(master_key, token, TokenKind::Node).map_err(|_| ApiError::Unauthorized)?;
    if claims.workspace_id != edge::TOKEN_WORKSPACE_ID {
        return Err(ApiError::Unauthorized);
    }
    let row: Option<(Option<String>, String)> =
        crate::db::query_tuple("SELECT node_token_hash, status FROM edge_nodes WHERE id = $1")
            .bind(&claims.node_id)
            .fetch_optional(pool)
            .await?;
    let Some((stored_hash, status)) = row else {
        return Err(ApiError::Unauthorized);
    };
    if status == "terminated" || stored_hash.as_deref() != Some(&tokens::fingerprint(token)) {
        return Err(ApiError::Unauthorized);
    }
    Ok(claims.node_id)
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|v| !v.is_empty())
}

async fn edge_status(pool: &DatabaseConnection, edge_node_id: &str) -> ApiResult<String> {
    let row: Option<(String,)> =
        crate::db::query_tuple("SELECT status FROM edge_nodes WHERE id = $1")
            .bind(edge_node_id)
            .fetch_optional(pool)
            .await?;
    row.map(|(status,)| status).ok_or(ApiError::Unauthorized)
}

#[derive(sea_orm::FromQueryResult)]
struct RuntimePeerRow {
    id: String,
    public_ipv4: String,
    wireguard_public_key: String,
    wireguard_mesh_ip: String,
    wireguard_listen_port: i32,
}

async fn runtime_peers(pool: &DatabaseConnection) -> ApiResult<Vec<EdgePeerConfig>> {
    let rows: Vec<RuntimePeerRow> = crate::db::query_as(
        "SELECT id, public_ipv4, wireguard_public_key, wireguard_mesh_ip, wireguard_listen_port \
         FROM nodes \
         WHERE status = 'ready' \
           AND provider = 'hetzner' \
           AND node_role <> 'builder' \
           AND private_network_capable = TRUE \
           AND public_ipv4 IS NOT NULL \
           AND wireguard_public_key IS NOT NULL \
           AND wireguard_mesh_ip IS NOT NULL \
         ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    let subnet_rows: Vec<(String, String)> =
        crate::db::query_tuple("SELECT node_id, cidr FROM project_network_node_subnets")
            .fetch_all(pool)
            .await?;

    Ok(rows
        .into_iter()
        .map(|node| {
            let mut allowed_ips = vec![format!("{}/32", node.wireguard_mesh_ip)];
            allowed_ips.extend(
                subnet_rows
                    .iter()
                    .filter(|(node_id, _)| node_id == &node.id)
                    .map(|(_, cidr)| cidr.clone()),
            );
            EdgePeerConfig {
                node_id: node.id,
                public_key: node.wireguard_public_key,
                endpoint: format!("{}:{}", node.public_ipv4, node.wireguard_listen_port),
                allowed_ips,
                persistent_keepalive_seconds: 25,
            }
        })
        .collect())
}

fn validate_wireguard_public_key(key: &str) -> ApiResult<()> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(key)
        .map_err(|_| ApiError::Validation("invalid wireguard_public_key".into()))?;
    if bytes.len() != 32 {
        return Err(ApiError::Validation("invalid wireguard_public_key".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::bearer;
    use axum::http::{HeaderMap, HeaderValue};

    #[test]
    fn bearer_requires_authorization_header() {
        let mut headers = HeaderMap::new();
        assert_eq!(bearer(&headers), None);
        headers.insert("authorization", HeaderValue::from_static("Basic nope"));
        assert_eq!(bearer(&headers), None);
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer edge-token"),
        );
        assert_eq!(bearer(&headers), Some("edge-token"));
    }
}
