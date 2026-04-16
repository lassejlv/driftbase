-- Node auth + lifecycle
ALTER TABLE nodes ADD COLUMN bootstrap_token_hash TEXT;
ALTER TABLE nodes ADD COLUMN node_token_hash TEXT;
ALTER TABLE nodes ADD COLUMN hetzner_server_id BIGINT;
ALTER TABLE nodes ADD COLUMN hetzner_location TEXT;
ALTER TABLE nodes ADD COLUMN hetzner_server_type TEXT;
ALTER TABLE nodes ADD COLUMN public_ipv4 TEXT;
ALTER TABLE nodes ADD COLUMN persistent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nodes ADD COLUMN idle_since_at TIMESTAMPTZ;
ALTER TABLE nodes ADD COLUMN registered_at TIMESTAMPTZ;

CREATE UNIQUE INDEX nodes_hetzner_server_id_idx
    ON nodes(hetzner_server_id)
    WHERE hetzner_server_id IS NOT NULL;

-- Workspace defaults and caps
ALTER TABLE workspaces ADD COLUMN hetzner_location TEXT NOT NULL DEFAULT 'nbg1';
ALTER TABLE workspaces ADD COLUMN default_server_type TEXT;
ALTER TABLE workspaces ADD COLUMN max_nodes INTEGER NOT NULL DEFAULT 3;
ALTER TABLE workspaces ADD COLUMN max_monthly_euro INTEGER NOT NULL DEFAULT 50;
ALTER TABLE workspaces ADD COLUMN autoscale_idle_ttl_seconds INTEGER NOT NULL DEFAULT 600;

-- Command queue: control plane enqueues, agent polls via heartbeat, acks update.
CREATE TABLE agent_commands (
    id              TEXT PRIMARY KEY,
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    deployment_id   TEXT REFERENCES deployments(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN (
        'pull_and_run', 'stop', 'restart', 'remove', 'drain', 'prune'
    )),
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'dispatched', 'acked', 'errored'
    )),
    result          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at   TIMESTAMPTZ,
    acked_at        TIMESTAMPTZ
);
CREATE INDEX agent_commands_node_status_idx ON agent_commands(node_id, status);
CREATE INDEX agent_commands_deployment_idx ON agent_commands(deployment_id);

-- Deployment log buffer (last N lines; kept bounded by agent-pushing in chunks).
CREATE TABLE deployment_logs (
    id              BIGSERIAL PRIMARY KEY,
    deployment_id   TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    stream          TEXT NOT NULL CHECK (stream IN ('stdout', 'stderr')),
    ts              TIMESTAMPTZ NOT NULL,
    line            TEXT NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deployment_logs_deployment_id_idx ON deployment_logs(deployment_id, id DESC);
