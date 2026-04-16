-- Lets admins pause auto-provisioning for a workspace. Deleting a node
-- automatically sets this to now() + 2 min so the scheduler doesn't immediately
-- replace a just-deleted node while the user is investigating.
ALTER TABLE workspaces
    ADD COLUMN scheduler_paused_until TIMESTAMPTZ;
