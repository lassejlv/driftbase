use crate::{execute_sql, DeriveMigrationName, MigrationTrait, SchemaManager};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct AddGlobalEdgeProxySchema;

#[async_trait::async_trait]
impl MigrationTrait for AddGlobalEdgeProxySchema {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_sql(manager, SQL).await
    }
}

pub const SQL: &str = r#"
CREATE TABLE IF NOT EXISTS edge_regions (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    provider        TEXT NOT NULL DEFAULT 'hetzner',
    location        TEXT NOT NULL,
    server_type     TEXT NOT NULL,
    desired_nodes   INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE edge_regions DROP CONSTRAINT IF EXISTS edge_regions_provider_check;
ALTER TABLE edge_regions ADD CONSTRAINT edge_regions_provider_check
    CHECK (provider IN ('hetzner'));

ALTER TABLE edge_regions DROP CONSTRAINT IF EXISTS edge_regions_status_check;
ALTER TABLE edge_regions ADD CONSTRAINT edge_regions_status_check
    CHECK (status IN ('active','disabled'));

ALTER TABLE edge_regions DROP CONSTRAINT IF EXISTS edge_regions_desired_nodes_check;
ALTER TABLE edge_regions ADD CONSTRAINT edge_regions_desired_nodes_check
    CHECK (desired_nodes >= 0);

CREATE TABLE IF NOT EXISTS edge_nodes (
    id                          TEXT PRIMARY KEY,
    region_id                   TEXT NOT NULL REFERENCES edge_regions(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    provider                    TEXT NOT NULL DEFAULT 'hetzner',
    status                      TEXT NOT NULL DEFAULT 'provisioning',
    public_ipv4                 TEXT,
    hetzner_server_id           BIGINT,
    hetzner_location            TEXT,
    hetzner_server_type         TEXT,
    bootstrap_token_hash        TEXT,
    node_token_hash             TEXT,
    wireguard_public_key        TEXT,
    wireguard_mesh_ip           TEXT,
    wireguard_listen_port       INTEGER NOT NULL DEFAULT 51820,
    agent_version               TEXT,
    route_count                 INTEGER NOT NULL DEFAULT 0,
    caddy_synced_at             TIMESTAMPTZ,
    caddy_sync_error            TEXT,
    private_network_synced_at   TIMESTAMPTZ,
    private_network_sync_error  TEXT,
    last_error                  TEXT,
    last_seen_at                TIMESTAMPTZ,
    registered_at               TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE edge_nodes DROP CONSTRAINT IF EXISTS edge_nodes_provider_check;
ALTER TABLE edge_nodes ADD CONSTRAINT edge_nodes_provider_check
    CHECK (provider IN ('hetzner'));

ALTER TABLE edge_nodes DROP CONSTRAINT IF EXISTS edge_nodes_status_check;
ALTER TABLE edge_nodes ADD CONSTRAINT edge_nodes_status_check
    CHECK (status IN ('provisioning','ready','draining','terminated','error'));

ALTER TABLE edge_nodes DROP CONSTRAINT IF EXISTS edge_nodes_route_count_check;
ALTER TABLE edge_nodes ADD CONSTRAINT edge_nodes_route_count_check
    CHECK (route_count >= 0);

ALTER TABLE edge_nodes DROP CONSTRAINT IF EXISTS edge_nodes_wireguard_listen_port_check;
ALTER TABLE edge_nodes ADD CONSTRAINT edge_nodes_wireguard_listen_port_check
    CHECK (wireguard_listen_port > 0 AND wireguard_listen_port <= 65535);

CREATE UNIQUE INDEX IF NOT EXISTS edge_nodes_hetzner_server_id_idx
    ON edge_nodes(hetzner_server_id)
    WHERE hetzner_server_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS edge_nodes_wireguard_mesh_ip_idx
    ON edge_nodes(wireguard_mesh_ip)
    WHERE wireguard_mesh_ip IS NOT NULL;

CREATE INDEX IF NOT EXISTS edge_nodes_region_status_idx
    ON edge_nodes(region_id, status);
"#;
