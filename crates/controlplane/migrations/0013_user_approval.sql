-- Waitlist / platform-admin approval for new signups.
--
-- `status` gates login: only 'approved' users can sign in. New signups
-- default to 'pending'; the first user ever to sign up is auto-promoted
-- to 'approved' + platform admin so the instance owner can bootstrap.
--
-- `is_platform_admin` grants access to the /admin endpoints (user
-- approval, future platform-wide settings). Distinct from workspace
-- ownership — platform admin is a property of the self-hosted
-- installation, not of any workspace.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users
    ADD CONSTRAINT users_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));

-- Existing installs: approve everyone already here so no one gets
-- locked out, and flag the earliest-registered user as platform admin
-- so they can manage approvals going forward.
UPDATE users SET status = 'approved' WHERE status = 'pending';
UPDATE users
SET is_platform_admin = true
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
