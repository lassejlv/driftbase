use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use driftbase_common::Id;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;
use crate::workspaces::membership::{self, Role};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/workspaces/:slug/credentials", get(list).post(create))
        .route(
            "/workspaces/:slug/credentials/:id",
            post(rotate).delete(delete),
        )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialKind {
    HetznerApiToken,
    GithubPat,
    Registry,
}

impl CredentialKind {
    fn as_str(self) -> &'static str {
        match self {
            CredentialKind::HetznerApiToken => "hetzner_api_token",
            CredentialKind::GithubPat => "github_pat",
            CredentialKind::Registry => "registry",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s {
            "hetzner_api_token" => Some(CredentialKind::HetznerApiToken),
            "github_pat" => Some(CredentialKind::GithubPat),
            "registry" => Some(CredentialKind::Registry),
            _ => None,
        }
    }
}

#[derive(Serialize)]
pub struct CredentialSummary {
    pub id: Id,
    pub kind: CredentialKind,
    pub name: String,
    pub metadata: JsonValue,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(sea_orm::FromQueryResult)]
struct CredentialRow {
    id: String,
    kind: String,
    name: String,
    metadata: JsonValue,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    last_used_at: Option<DateTime<Utc>>,
}

impl TryFrom<CredentialRow> for CredentialSummary {
    type Error = ApiError;
    fn try_from(r: CredentialRow) -> Result<Self, ApiError> {
        Ok(Self {
            id: r
                .id
                .parse()
                .map_err(|e| ApiError::Internal(anyhow::anyhow!("{e}")))?,
            kind: CredentialKind::parse(&r.kind)
                .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("bad kind: {}", r.kind)))?,
            name: r.name,
            metadata: r.metadata,
            created_at: r.created_at,
            updated_at: r.updated_at,
            last_used_at: r.last_used_at,
        })
    }
}

async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(slug): Path<String>,
) -> ApiResult<Json<Vec<CredentialSummary>>> {
    let ctx = membership::resolve(state.pool(), &slug, &auth.user_id).await?;
    membership::require(&ctx, Role::Admin)?;

    let rows: Vec<CredentialRow> = crate::db::query_as(
        "SELECT id, kind, name, metadata, created_at, updated_at, last_used_at \
         FROM credentials \
         WHERE workspace_id = $1 \
           AND kind <> 'github_pat' \
           AND COALESCE(metadata->>'managed_by', '') <> 'driftbase' \
         ORDER BY created_at DESC",
    )
    .bind(ctx.workspace_id.to_string())
    .fetch_all(state.pool())
    .await?;

    rows.into_iter()
        .map(CredentialSummary::try_from)
        .collect::<Result<Vec<_>, _>>()
        .map(Json)
}

#[derive(Deserialize)]
pub struct CreateCredentialRequest {
    pub kind: CredentialKind,
    pub name: String,
    pub secret: String,
    #[serde(default)]
    pub metadata: Option<JsonValue>,
}

async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(slug): Path<String>,
    Json(req): Json<CreateCredentialRequest>,
) -> ApiResult<Json<CredentialSummary>> {
    let ctx = membership::resolve(state.pool(), &slug, &auth.user_id).await?;
    membership::require(&ctx, Role::Admin)?;

    let name = req.name.trim().to_string();
    if name.is_empty() || name.len() > 80 {
        return Err(ApiError::Validation("name must be 1–80 chars".into()));
    }
    if req.secret.is_empty() {
        return Err(ApiError::Validation("secret is required".into()));
    }

    if matches!(req.kind, CredentialKind::HetznerApiToken) {
        return Err(ApiError::Forbidden(
            "Hetzner is configured by the Driftbase control plane".into(),
        ));
    }
    if matches!(req.kind, CredentialKind::GithubPat) {
        return Err(ApiError::Validation(
            "GitHub PAT credentials are no longer supported; connect the GitHub App instead".into(),
        ));
    }

    let encrypted = state
        .master_key()
        .encrypt(req.secret.as_bytes())
        .map_err(ApiError::Internal)?;

    let id = Id::new();
    let metadata = req
        .metadata
        .unwrap_or_else(|| JsonValue::Object(Default::default()));

    if matches!(req.kind, CredentialKind::Registry) {
        if let Some(bundled) = state.config().registry_site.as_deref() {
            let is_bundled = metadata
                .get("url")
                .and_then(|v| v.as_str())
                .map(|u| registry_host_matches(u, bundled))
                .unwrap_or(false);
            if is_bundled {
                return Err(ApiError::Validation(
                    "Bundled registry credentials are managed by Driftbase".into(),
                ));
            }
        }
    }

    let inserted: Option<CredentialRow> = crate::db::query_as(
        "INSERT INTO credentials (id, workspace_id, kind, name, encrypted, metadata, created_by) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         ON CONFLICT (workspace_id, kind, name) DO NOTHING \
         RETURNING id, kind, name, metadata, created_at, updated_at, last_used_at",
    )
    .bind(id.to_string())
    .bind(ctx.workspace_id.to_string())
    .bind(req.kind.as_str())
    .bind(&name)
    .bind(&encrypted)
    .bind(&metadata)
    .bind(auth.user_id.to_string())
    .fetch_optional(state.pool())
    .await?;

    let row = inserted
        .ok_or_else(|| ApiError::Conflict("credential with that name already exists".into()))?;
    Ok(Json(CredentialSummary::try_from(row)?))
}

#[derive(Deserialize)]
pub struct RotateCredentialRequest {
    pub secret: String,
    #[serde(default)]
    pub metadata: Option<JsonValue>,
}

async fn rotate(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((slug, id)): Path<(String, String)>,
    Json(req): Json<RotateCredentialRequest>,
) -> ApiResult<Json<CredentialSummary>> {
    let ctx = membership::resolve(state.pool(), &slug, &auth.user_id).await?;
    membership::require(&ctx, Role::Admin)?;

    if req.secret.is_empty() {
        return Err(ApiError::Validation("secret is required".into()));
    }

    let existing: Option<(String, JsonValue)> = crate::db::query_tuple(
        "SELECT kind, metadata FROM credentials WHERE id = $1 AND workspace_id = $2",
    )
    .bind(&id)
    .bind(ctx.workspace_id.to_string())
    .fetch_optional(state.pool())
    .await?;
    let (kind_str, existing_metadata) = existing.ok_or(ApiError::NotFound)?;
    let kind = CredentialKind::parse(&kind_str)
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("bad kind: {kind_str}")))?;
    if existing_metadata
        .get("managed_by")
        .and_then(|v| v.as_str())
        .is_some_and(|managed_by| managed_by == "driftbase")
    {
        return Err(ApiError::Forbidden(
            "Managed credentials are handled by Driftbase".into(),
        ));
    }

    if matches!(kind, CredentialKind::HetznerApiToken) {
        return Err(ApiError::Forbidden(
            "Hetzner is configured by the Driftbase control plane".into(),
        ));
    }
    if matches!(kind, CredentialKind::GithubPat) {
        return Err(ApiError::Validation(
            "GitHub PAT credentials are no longer supported; connect the GitHub App instead".into(),
        ));
    }
    if matches!(kind, CredentialKind::Registry) {
        if let Some(bundled) = state.config().registry_site.as_deref() {
            let metadata = req.metadata.as_ref().unwrap_or(&existing_metadata);
            let is_bundled = metadata
                .get("url")
                .and_then(|v| v.as_str())
                .map(|u| registry_host_matches(u, bundled))
                .unwrap_or(false);
            if is_bundled {
                return Err(ApiError::Validation(
                    "Bundled registry credentials are managed by Driftbase".into(),
                ));
            }
        }
    }

    let encrypted = state
        .master_key()
        .encrypt(req.secret.as_bytes())
        .map_err(ApiError::Internal)?;

    let row: CredentialRow = crate::db::query_as(
        "UPDATE credentials SET encrypted = $1, \
         metadata = COALESCE($2, metadata), \
         updated_at = now() \
         WHERE id = $3 AND workspace_id = $4 \
         RETURNING id, kind, name, metadata, created_at, updated_at, last_used_at",
    )
    .bind(&encrypted)
    .bind(req.metadata)
    .bind(&id)
    .bind(ctx.workspace_id.to_string())
    .fetch_one(state.pool())
    .await?;

    Ok(Json(CredentialSummary::try_from(row)?))
}

/// True if `url` refers to the bundled registry — matches on hostname only
/// so `https://registry.driftbase.app/ws/svc` and the bare `registry.driftbase.app`
/// both count.
fn registry_host_matches(url: &str, bundled_host: &str) -> bool {
    let host = url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("")
        .to_lowercase();
    host == bundled_host.to_lowercase()
}

async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((slug, id)): Path<(String, String)>,
) -> ApiResult<()> {
    let ctx = membership::resolve(state.pool(), &slug, &auth.user_id).await?;
    membership::require(&ctx, Role::Admin)?;

    let existing: Option<(JsonValue,)> = crate::db::query_tuple(
        "SELECT metadata FROM credentials WHERE id = $1 AND workspace_id = $2",
    )
    .bind(&id)
    .bind(ctx.workspace_id.to_string())
    .fetch_optional(state.pool())
    .await?;
    let (metadata,) = existing.ok_or(ApiError::NotFound)?;
    if metadata
        .get("managed_by")
        .and_then(|v| v.as_str())
        .is_some_and(|managed_by| managed_by == "driftbase")
    {
        return Err(ApiError::Forbidden(
            "Managed credentials are handled by Driftbase".into(),
        ));
    }

    let res = crate::db::query("DELETE FROM credentials WHERE id = $1 AND workspace_id = $2")
        .bind(&id)
        .bind(ctx.workspace_id.to_string())
        .execute(state.pool())
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(())
}
