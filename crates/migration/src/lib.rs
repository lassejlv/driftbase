pub use sea_orm_migration::prelude::*;

#[path = "../migrations/m20260513_000002_managed_runtime.rs"]
mod m20260513_000002_managed_runtime;
#[path = "../migrations/m20260513_000003_github_app_builds.rs"]
mod m20260513_000003_github_app_builds;
#[path = "../migrations/m20260513_000004_repair_github_app_builds.rs"]
mod m20260513_000004_repair_github_app_builds;
#[path = "../migrations/m20260513_000005_build_first_nodes.rs"]
mod m20260513_000005_build_first_nodes;
#[path = "../migrations/m20260513_000006_global_edge_proxy.rs"]
mod m20260513_000006_global_edge_proxy;
mod migration;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(migration::LegacyInitialSchema),
            Box::new(m20260513_000002_managed_runtime::AddManagedRuntimeSchema),
            Box::new(m20260513_000003_github_app_builds::AddGitHubAppBuildsSchema),
            Box::new(m20260513_000004_repair_github_app_builds::RepairGitHubAppBuildsSchema),
            Box::new(m20260513_000005_build_first_nodes::AddBuildFirstNodesSchema),
            Box::new(m20260513_000006_global_edge_proxy::AddGlobalEdgeProxySchema),
        ]
    }
}

pub async fn ensure_runtime_schema(db: &sea_orm::DatabaseConnection) -> Result<(), DbErr> {
    for statement in split_sql_statements(m20260513_000003_github_app_builds::SQL) {
        db.execute_unprepared(statement).await?;
    }
    for statement in split_sql_statements(m20260513_000005_build_first_nodes::SQL) {
        db.execute_unprepared(statement).await?;
    }
    for statement in split_sql_statements(m20260513_000006_global_edge_proxy::SQL) {
        db.execute_unprepared(statement).await?;
    }
    Ok(())
}

pub(crate) async fn execute_sql(manager: &SchemaManager<'_>, sql: &str) -> Result<(), DbErr> {
    let db = manager.get_connection();
    for statement in split_sql_statements(sql) {
        db.execute_unprepared(statement).await?;
    }
    Ok(())
}

pub(crate) fn split_sql_statements(sql: &str) -> impl Iterator<Item = &str> {
    sql.split(';')
        .map(str::trim)
        .filter(|stmt| !stmt.is_empty())
}

pub(crate) fn strip_line_comments(sql: &str) -> String {
    let mut stripped = String::with_capacity(sql.len());
    for line in sql.lines() {
        let line = line.split_once("--").map_or(line, |(before, _)| before);
        stripped.push_str(line);
        stripped.push('\n');
    }
    stripped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_names_stay_compatible_with_existing_seaql_rows() {
        let names = Migrator::migrations()
            .into_iter()
            .map(|migration| migration.name().to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            names,
            vec![
                "migration",
                "m20260513_000002_managed_runtime",
                "m20260513_000003_github_app_builds",
                "m20260513_000004_repair_github_app_builds",
                "m20260513_000005_build_first_nodes",
                "m20260513_000006_global_edge_proxy",
            ]
        );
    }

    #[test]
    fn sql_splitter_ignores_empty_statements() {
        let statements = split_sql_statements("SELECT 1;\n\n ; SELECT 2;").collect::<Vec<_>>();

        assert_eq!(statements, vec!["SELECT 1", "SELECT 2"]);
    }
}
