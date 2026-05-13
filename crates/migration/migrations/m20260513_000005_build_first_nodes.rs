use crate::{execute_sql, DeriveMigrationName, MigrationTrait, SchemaManager};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct AddBuildFirstNodesSchema;

#[async_trait::async_trait]
impl MigrationTrait for AddBuildFirstNodesSchema {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_sql(manager, SQL).await
    }
}

pub const SQL: &str = r#"
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS node_role TEXT NOT NULL DEFAULT 'runtime';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS idle_ttl_seconds INTEGER;

UPDATE nodes
SET node_role = 'builder'
WHERE labels->>'role' = 'builder'
  AND node_role <> 'builder';

UPDATE nodes
SET idle_ttl_seconds = CASE
    WHEN labels->>'autoscale_idle_ttl_seconds' ~ '^[0-9]+$'
    THEN (labels->>'autoscale_idle_ttl_seconds')::integer
    ELSE 10800
END
WHERE node_role = 'builder'
  AND idle_ttl_seconds IS NULL;

ALTER TABLE nodes DROP CONSTRAINT IF EXISTS nodes_node_role_check;
ALTER TABLE nodes ADD CONSTRAINT nodes_node_role_check
    CHECK (node_role IN ('runtime','builder'));

ALTER TABLE nodes DROP CONSTRAINT IF EXISTS nodes_idle_ttl_seconds_positive_check;
ALTER TABLE nodes ADD CONSTRAINT nodes_idle_ttl_seconds_positive_check
    CHECK (idle_ttl_seconds IS NULL OR idle_ttl_seconds > 0);

CREATE INDEX IF NOT EXISTS nodes_workspace_role_status_idx
    ON nodes(workspace_id, node_role, status);
"#;
