use crate::{execute_sql, strip_line_comments, DeriveMigrationName, MigrationTrait, SchemaManager};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct LegacyInitialSchema;

#[async_trait::async_trait]
impl MigrationTrait for LegacyInitialSchema {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = strip_line_comments(include_str!("../migrations/initial_schema.sql"));
        execute_sql(manager, &schema).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_sql(manager, DOWN_SQL).await
    }
}

const DOWN_SQL: &str = r#"
DROP TABLE IF EXISTS project_network_node_subnets CASCADE;
DROP TABLE IF EXISTS project_networks CASCADE;
DROP TABLE IF EXISTS deployment_metrics CASCADE;
DROP TABLE IF EXISTS volumes CASCADE;
DROP TABLE IF EXISTS builds CASCADE;
DROP TABLE IF EXISTS service_domains CASCADE;
DROP TABLE IF EXISTS deployment_logs CASCADE;
DROP TABLE IF EXISTS agent_commands CASCADE;
DROP TABLE IF EXISTS node_allocations CASCADE;
DROP TABLE IF EXISTS deployments CASCADE;
DROP TABLE IF EXISTS nodes CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS ssh_keys CASCADE;
DROP TABLE IF EXISTS credentials CASCADE;
DROP TABLE IF EXISTS invites CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP EXTENSION IF EXISTS citext;
"#;
