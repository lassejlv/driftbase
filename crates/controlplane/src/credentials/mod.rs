pub mod routes;

use anyhow::{anyhow, Context, Result};
use sqlx::PgPool;

use crate::crypto::MasterKey;

/// Decrypt and return the first Hetzner API token stored for `workspace_id`, if any.
pub async fn first_hetzner_token(
    pool: &PgPool,
    master_key: &MasterKey,
    workspace_id: &str,
) -> Result<Option<String>> {
    let row: Option<(Vec<u8>,)> = sqlx::query_as(
        "SELECT encrypted FROM credentials \
         WHERE workspace_id = $1 AND kind = 'hetzner_api_token' \
         ORDER BY created_at ASC LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(pool)
    .await?;
    let Some((ct,)) = row else { return Ok(None) };
    let pt = master_key
        .decrypt(&ct)
        .context("decrypting Hetzner token")?;
    let s = String::from_utf8(pt).map_err(|e| anyhow!("token not utf8: {e}"))?;
    Ok(Some(s))
}
