use crate::{
    execute_sql, m20260513_000003_github_app_builds, DeriveMigrationName, MigrationTrait,
    SchemaManager,
};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct RepairGitHubAppBuildsSchema;

#[async_trait::async_trait]
impl MigrationTrait for RepairGitHubAppBuildsSchema {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_sql(manager, m20260513_000003_github_app_builds::SQL).await
    }
}
