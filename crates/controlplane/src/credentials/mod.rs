pub mod routes;

use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use driftbase_common::Id;
use rand::rngs::OsRng;
use rand::RngCore;
use sea_orm::DatabaseConnection;
use serde_json::{json, Value as JsonValue};

use crate::config::Config;
use crate::crypto::MasterKey;

pub async fn hetzner_token_for_workspace(
    pool: &DatabaseConnection,
    config: &Config,
    master_key: &MasterKey,
    workspace_id: &str,
) -> Result<Option<String>> {
    let _ = (pool, master_key, workspace_id);
    Ok(config.managed_hetzner_api_token.clone())
}

/// Decrypted view of a stored credential. Caller is expected to use the
/// plaintext immediately (ship it to an agent in-memory) and drop it.
pub struct DecryptedCredential {
    pub kind: String,
    pub secret: String,
    pub metadata: JsonValue,
}

pub struct RegistryCredentialRef {
    pub id: String,
    pub url: String,
    pub username: String,
}

const BUNDLED_REGISTRY_CREDENTIAL_NAME: &str = "__driftbase_bundled_registry";

pub async fn ensure_bundled_registry_credential(
    pool: &DatabaseConnection,
    config: &Config,
    master_key: &MasterKey,
    workspace_id: &str,
) -> Result<RegistryCredentialRef> {
    let registry_site = config
        .registry_site
        .as_deref()
        .ok_or_else(|| anyhow!("bundled registry is not configured"))?;
    let registry_url = registry_site
        .trim()
        .trim_end_matches('/')
        .to_ascii_lowercase();

    if let Some((id,)) = crate::db::query_tuple::<(String,)>(
        "SELECT id FROM credentials \
         WHERE workspace_id = $1 AND kind = 'registry' AND name = $2",
    )
    .bind(workspace_id)
    .bind(BUNDLED_REGISTRY_CREDENTIAL_NAME)
    .fetch_optional(pool)
    .await?
    {
        ensure_bundled_registry_metadata(pool, &id, &registry_url).await?;
        return Ok(RegistryCredentialRef {
            id: id.clone(),
            url: registry_url,
            username: id,
        });
    }

    let owner: Option<(String,)> =
        crate::db::query_tuple("SELECT owner_user_id FROM workspaces WHERE id = $1")
            .bind(workspace_id)
            .fetch_optional(pool)
            .await?;
    let (owner_user_id,) = owner.ok_or_else(|| anyhow!("workspace {workspace_id} not found"))?;

    let id = Id::new().to_string();
    let secret = random_secret();
    let encrypted = master_key
        .encrypt(secret.as_bytes())
        .context("encrypting bundled registry credential")?;
    let metadata = bundled_registry_metadata(&id, &registry_url);

    let inserted: Option<(String,)> = crate::db::query_tuple(
        "INSERT INTO credentials (id, workspace_id, kind, name, encrypted, metadata, created_by) \
         VALUES ($1, $2, 'registry', $3, $4, $5, $6) \
         ON CONFLICT (workspace_id, kind, name) DO NOTHING \
         RETURNING id",
    )
    .bind(&id)
    .bind(workspace_id)
    .bind(BUNDLED_REGISTRY_CREDENTIAL_NAME)
    .bind(&encrypted)
    .bind(metadata)
    .bind(owner_user_id)
    .fetch_optional(pool)
    .await?;

    let id = match inserted {
        Some((id,)) => id,
        None => {
            let (id,): (String,) = crate::db::query_tuple(
                "SELECT id FROM credentials \
                 WHERE workspace_id = $1 AND kind = 'registry' AND name = $2",
            )
            .bind(workspace_id)
            .bind(BUNDLED_REGISTRY_CREDENTIAL_NAME)
            .fetch_one(pool)
            .await?;
            ensure_bundled_registry_metadata(pool, &id, &registry_url).await?;
            id
        }
    };

    Ok(RegistryCredentialRef {
        id: id.clone(),
        url: registry_url,
        username: id,
    })
}

async fn ensure_bundled_registry_metadata(
    pool: &DatabaseConnection,
    id: &str,
    registry_url: &str,
) -> Result<()> {
    crate::db::query("UPDATE credentials SET metadata = $1, updated_at = now() WHERE id = $2")
        .bind(bundled_registry_metadata(id, registry_url))
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

fn bundled_registry_metadata(id: &str, registry_url: &str) -> JsonValue {
    json!({
        "url": registry_url,
        "username": id,
        "managed_by": "driftbase",
    })
}

fn random_secret() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Fetch + decrypt a credential by id, scoped to `workspace_id`. Returns None
/// if the credential is missing, the workspace doesn't own it, or the secret
/// isn't valid UTF-8 (all of our kinds store text — tokens, passwords, PATs).
pub async fn fetch_decrypted(
    pool: &DatabaseConnection,
    master_key: &MasterKey,
    workspace_id: &str,
    credential_id: &str,
) -> Result<Option<DecryptedCredential>> {
    let row: Option<(String, Vec<u8>, JsonValue)> = crate::db::query_tuple(
        "SELECT kind, encrypted, metadata FROM credentials \
         WHERE id = $1 AND workspace_id = $2",
    )
    .bind(credential_id)
    .bind(workspace_id)
    .fetch_optional(pool)
    .await?;
    let Some((kind, ct, metadata)) = row else {
        return Ok(None);
    };
    let pt = master_key
        .decrypt(&ct)
        .with_context(|| format!("decrypting credential {credential_id}"))?;
    let secret = String::from_utf8(pt).map_err(|e| anyhow!("credential not utf8: {e}"))?;
    Ok(Some(DecryptedCredential {
        kind,
        secret,
        metadata,
    }))
}

/// Registry-proxy lookup: fetch + decrypt by id without knowing the workspace
/// in advance. Returns the owning workspace id so the caller can check it
/// against the URL path. The registry proxy uses this and then enforces the
/// workspace-scope check itself.
pub async fn fetch_for_proxy(
    pool: &DatabaseConnection,
    master_key: &MasterKey,
    credential_id: &str,
) -> Result<Option<(String, DecryptedCredential)>> {
    let row: Option<(String, String, Vec<u8>, JsonValue)> = crate::db::query_tuple(
        "SELECT workspace_id, kind, encrypted, metadata FROM credentials \
         WHERE id = $1",
    )
    .bind(credential_id)
    .fetch_optional(pool)
    .await?;
    let Some((workspace_id, kind, ct, metadata)) = row else {
        return Ok(None);
    };
    let pt = master_key
        .decrypt(&ct)
        .with_context(|| format!("decrypting credential {credential_id}"))?;
    let secret = String::from_utf8(pt).map_err(|e| anyhow!("credential not utf8: {e}"))?;
    Ok(Some((
        workspace_id,
        DecryptedCredential {
            kind,
            secret,
            metadata,
        },
    )))
}
