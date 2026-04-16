-- Local-docker nodes are no longer auto-bootstrapped. Sweep out any leftover
-- rows from earlier runs so workspaces only surface real (Hetzner) nodes.
DELETE FROM nodes WHERE provider = 'local_docker';
