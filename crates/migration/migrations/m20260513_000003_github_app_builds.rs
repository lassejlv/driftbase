use crate::{execute_sql, DeriveMigrationName, MigrationTrait, SchemaManager};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct AddGitHubAppBuildsSchema;

#[async_trait::async_trait]
impl MigrationTrait for AddGitHubAppBuildsSchema {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_sql(manager, SQL).await
    }
}

pub const SQL: &str = r#"
ALTER TABLE services ADD COLUMN IF NOT EXISTS github_installation_id BIGINT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS github_repository_id BIGINT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS github_repository_full_name TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS github_auto_deploy BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS github_statuses_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE builds ADD COLUMN IF NOT EXISTS trigger_kind TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE builds ADD COLUMN IF NOT EXISTS git_ref TEXT;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS git_sha TEXT;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS github_delivery_id TEXT;

ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_trigger_kind_check;
ALTER TABLE builds ADD CONSTRAINT builds_trigger_kind_check
    CHECK (trigger_kind IN ('manual','github_push'));

CREATE INDEX IF NOT EXISTS builds_github_delivery_idx
    ON builds(github_delivery_id)
    WHERE github_delivery_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS github_installations (
    id                    TEXT PRIMARY KEY,
    workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    installation_id       BIGINT NOT NULL,
    account_login         TEXT NOT NULL,
    account_id            BIGINT NOT NULL,
    account_type          TEXT NOT NULL,
    repository_selection  TEXT NOT NULL,
    permissions           JSONB NOT NULL DEFAULT '{}'::jsonb,
    events                JSONB NOT NULL DEFAULT '[]'::jsonb,
    html_url              TEXT,
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    suspended_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, installation_id)
);

CREATE INDEX IF NOT EXISTS github_installations_workspace_idx
    ON github_installations(workspace_id);
CREATE INDEX IF NOT EXISTS github_installations_installation_idx
    ON github_installations(installation_id);

CREATE TABLE IF NOT EXISTS github_repositories (
    workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    installation_id       BIGINT NOT NULL,
    repository_id         BIGINT NOT NULL,
    full_name             TEXT NOT NULL,
    private               BOOLEAN NOT NULL DEFAULT FALSE,
    default_branch        TEXT NOT NULL DEFAULT 'main',
    clone_url             TEXT NOT NULL,
    html_url              TEXT NOT NULL,
    archived              BOOLEAN NOT NULL DEFAULT FALSE,
    disabled              BOOLEAN NOT NULL DEFAULT FALSE,
    permissions           JSONB NOT NULL DEFAULT '{}'::jsonb,
    pushed_at             TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, installation_id, repository_id)
);

CREATE INDEX IF NOT EXISTS github_repositories_workspace_idx
    ON github_repositories(workspace_id);
CREATE INDEX IF NOT EXISTS github_repositories_installation_repo_idx
    ON github_repositories(installation_id, repository_id);

CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
    delivery_id           TEXT PRIMARY KEY,
    event                 TEXT NOT NULL,
    installation_id       BIGINT,
    status                TEXT NOT NULL CHECK (status IN ('processing','processed','ignored','failed')),
    error                 TEXT,
    received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS github_webhook_deliveries_installation_idx
    ON github_webhook_deliveries(installation_id);
"#;
