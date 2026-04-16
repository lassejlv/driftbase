-- Credentials (encrypted-at-rest secrets scoped to a workspace)
CREATE TABLE credentials (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('hetzner_api_token', 'github_pat', 'registry')),
    name            TEXT NOT NULL,
    encrypted       BYTEA NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ,
    UNIQUE (workspace_id, kind, name)
);
CREATE INDEX credentials_workspace_idx ON credentials(workspace_id);

-- SSH keys (public key + OpenSSH SHA256 fingerprint, optional encrypted private key, optional Hetzner key id)
CREATE TABLE ssh_keys (
    id                    TEXT PRIMARY KEY,
    workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    public_key            TEXT NOT NULL,
    fingerprint           TEXT NOT NULL,
    private_key_encrypted BYTEA,
    hetzner_key_id        BIGINT,
    created_by            TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);
CREATE INDEX ssh_keys_workspace_idx ON ssh_keys(workspace_id);
CREATE INDEX ssh_keys_fingerprint_idx ON ssh_keys(fingerprint);
