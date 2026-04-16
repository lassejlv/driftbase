pub mod routes;

use anyhow::Result;
use sqlx::PgPool;

pub struct SshKeyForSync {
    pub id: String,
    pub name: String,
    pub public_key: String,
    pub fingerprint: String,
}

pub async fn list_for_sync(pool: &PgPool, workspace_id: &str) -> Result<Vec<SshKeyForSync>> {
    let rows: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT id, name, public_key, fingerprint FROM ssh_keys WHERE workspace_id = $1",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, public_key, fingerprint)| SshKeyForSync {
            id,
            name,
            public_key,
            fingerprint,
        })
        .collect())
}
