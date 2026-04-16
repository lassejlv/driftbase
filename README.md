# Zediz

Self-hosted PaaS on Hetzner: a Rust control plane + node agent that turns a Hetzner API token into an elastic, auto-scaling container platform. Point it at a Docker image or a Git repo, hit deploy, and Zediz places the workload on an existing node or provisions a new one automatically.

See [`PLAN_ZEDIZ.md`](./PLAN_ZEDIZ.md) for architecture and phased roadmap.

## Repo layout

- `crates/controlplane` — HTTP API, scheduler, provisioner
- `crates/agent` — per-node daemon running on every managed server
- `crates/hetzner` — typed Hetzner Cloud API client
- `crates/proto` — wire types shared between control plane and agent
- `crates/common` — errors, IDs, tracing, crypto helpers
- `web/` — Vite 8 + React 19 + TanStack Router/Query + Tailwind v4

## Local dev

```sh
# Start Postgres
docker compose up -d

# Backend (workspace)
cargo check
cargo run -p zediz-controlplane

# Frontend
cd web
bun install
bun run dev
```

Requires Rust stable (pinned via `rust-toolchain.toml`) and Bun.

## Status

Phase 0 scaffold. Not usable yet.
