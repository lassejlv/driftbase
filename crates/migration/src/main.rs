#[tokio::main]
async fn main() {
    sea_orm_migration::cli::run_cli(driftbase_migration::Migrator).await;
}
