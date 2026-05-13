use crate::{execute_sql, DeriveMigrationName, MigrationTrait, SchemaManager};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct AddManagedRuntimeSchema;

#[async_trait::async_trait]
impl MigrationTrait for AddManagedRuntimeSchema {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_sql(manager, SQL).await
    }
}

const SQL: &str = r#"
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS private_network_capable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS wireguard_public_key TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS wireguard_mesh_ip TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS wireguard_listen_port INTEGER NOT NULL DEFAULT 51820;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS private_network_synced_at TIMESTAMPTZ;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS private_network_sync_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS nodes_wireguard_mesh_ip_unique
    ON nodes (wireguard_mesh_ip)
    WHERE wireguard_mesh_ip IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_networks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    cidr        TEXT NOT NULL UNIQUE,
    domain      TEXT NOT NULL DEFAULT 'driftbase.internal',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_network_node_subnets (
    project_network_id TEXT NOT NULL REFERENCES project_networks(id) ON DELETE CASCADE,
    node_id            TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    cidr               TEXT NOT NULL UNIQUE,
    gateway_ip         TEXT NOT NULL,
    dns_ip             TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_network_id, node_id)
);

CREATE INDEX IF NOT EXISTS project_network_node_subnets_node_idx
    ON project_network_node_subnets (node_id);

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS private_ipv4 TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS deployments_private_ipv4_unique
    ON deployments (private_ipv4)
    WHERE private_ipv4 IS NOT NULL;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS hetzner_location TEXT NOT NULL DEFAULT 'nbg1';

WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1 AS idx
    FROM projects
)
INSERT INTO project_networks (id, project_id, cidr)
SELECT
    id,
    id,
    '10.' || (64 + idx)::text || '.0.0/16'
FROM numbered
WHERE idx < 191
ON CONFLICT (project_id) DO NOTHING;

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_image_ref TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_image_digest TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_self_update_capable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_update_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_update_checked_at TIMESTAMPTZ;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_update_target_image_ref TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_update_target_digest TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_update_command_id TEXT REFERENCES agent_commands(id) ON DELETE SET NULL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_update_error TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_update_started_at TIMESTAMPTZ;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_update_finished_at TIMESTAMPTZ;

ALTER TABLE agent_commands DROP CONSTRAINT IF EXISTS agent_commands_kind_check;
ALTER TABLE agent_commands ADD CONSTRAINT agent_commands_kind_check
    CHECK (kind IN (
        'pull_and_run','stop','restart','remove',
        'drain','prune','update_routes','build','sync_private_network',
        'update_agent'
    ));
"#;
