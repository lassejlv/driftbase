-- Projects
CREATE TABLE projects (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    created_by      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, slug)
);
CREATE INDEX projects_workspace_idx ON projects(workspace_id);

-- Services (image source only in phase 3; git arrives in later phases)
CREATE TABLE services (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    source          TEXT NOT NULL CHECK (source IN ('image')),
    image_ref       TEXT,
    env_vars        JSONB NOT NULL DEFAULT '{}'::jsonb,
    ports           JSONB NOT NULL DEFAULT '[]'::jsonb,
    resources       JSONB NOT NULL DEFAULT '{"cpu_millis":500,"memory_mb":256,"disk_mb":1024}'::jsonb,
    replicas        INTEGER NOT NULL DEFAULT 1 CHECK (replicas >= 1),
    restart_policy  TEXT NOT NULL DEFAULT 'on-failure' CHECK (restart_policy IN ('no', 'on-failure', 'always')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, slug)
);
CREATE INDEX services_project_idx ON services(project_id);

-- Nodes (can be local-docker during dev, or hetzner-provisioned later)
CREATE TABLE nodes (
    id                TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    provider          TEXT NOT NULL CHECK (provider IN ('local_docker', 'hetzner')),
    provider_node_id  TEXT,
    status            TEXT NOT NULL CHECK (status IN ('provisioning', 'ready', 'draining', 'terminated')),
    total_cpu_millis  INTEGER NOT NULL,
    total_memory_mb   INTEGER NOT NULL,
    total_disk_mb     INTEGER NOT NULL,
    labels            JSONB NOT NULL DEFAULT '{}'::jsonb,
    agent_version     TEXT,
    last_seen_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);
CREATE INDEX nodes_workspace_idx ON nodes(workspace_id);
CREATE INDEX nodes_status_idx ON nodes(status);

-- Deployments (one row per service instance lifetime)
CREATE TABLE deployments (
    id              TEXT PRIMARY KEY,
    service_id      TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    node_id         TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    status          TEXT NOT NULL CHECK (status IN (
        'pending', 'placing', 'pulling', 'starting', 'running', 'failing', 'stopped', 'errored'
    )),
    image_ref       TEXT NOT NULL,
    env_vars        JSONB NOT NULL DEFAULT '{}'::jsonb,
    ports           JSONB NOT NULL DEFAULT '[]'::jsonb,
    resources       JSONB NOT NULL,
    container_id    TEXT,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    stopped_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deployments_service_idx ON deployments(service_id);
CREATE INDEX deployments_node_idx ON deployments(node_id);
CREATE INDEX deployments_status_idx ON deployments(status);

-- Node allocations — current resource reservations per active deployment
CREATE TABLE node_allocations (
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    deployment_id   TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    cpu_millis      INTEGER NOT NULL,
    memory_mb       INTEGER NOT NULL,
    disk_mb         INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (node_id, deployment_id)
);
