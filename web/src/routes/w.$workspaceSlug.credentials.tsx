import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Github, RefreshCw } from 'lucide-react';
import { canAdmin, workspaceQuery } from '@/lib/workspaces';
import { Button, Card, PageHeader, Stack } from '@/components/ui';
import { usePublicSettings } from '@/lib/settings';
import {
  githubConnectUrl,
  githubInstallationsQuery,
  useSyncGitHubInstallation,
} from '@/lib/github';

export const Route = createFileRoute('/w/$workspaceSlug/credentials')({
  component: CredentialsPage,
});

function CredentialsPage() {
  const { workspaceSlug } = Route.useParams();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const settings = usePublicSettings();
  const githubInstallations = useQuery({
    ...githubInstallationsQuery(workspaceSlug),
    enabled: !!settings.data?.github_app_configured,
  });
  const syncGithub = useSyncGitHubInstallation(workspaceSlug);

  const canManage = canAdmin(workspace.data);

  if (!canManage) {
    return (
      <Stack gap={6}>
        <PageHeader title="Credentials" />
        <Card className="p-5">
          <p className="text-sm text-[var(--color-muted)]">
            You need admin or owner role to view credentials.
          </p>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <PageHeader
        title="Credentials"
        subtitle="Connect source providers. Registry auth for Git builds is managed by Driftbase."
      />

      {settings.data?.github_app_configured ? (
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                <h2 className="text-sm font-medium">GitHub App</h2>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--color-muted)]">
                Connect repositories to Driftbase for Git builds, push webhooks, and commit
                statuses.
              </p>
            </div>
            <a href={githubConnectUrl(workspaceSlug)}>
              <Button>Connect GitHub</Button>
            </a>
          </div>
          {githubInstallations.data?.length ? (
            <div className="mt-4 divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
              {githubInstallations.data.map((installation) => (
                <div
                  key={installation.installation_id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{installation.account_login}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {installation.account_type} · {installation.repository_selection} repos ·{' '}
                      {installation.active ? 'active' : 'inactive'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={syncGithub.isPending}
                    onClick={() => syncGithub.mutate(installation.installation_id)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Sync
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-[var(--color-muted)]">
              No GitHub installations connected yet.
            </p>
          )}
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            <h2 className="text-sm font-medium">GitHub App</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
            GitHub App integration is not configured for this control plane.
          </p>
        </Card>
      )}
    </Stack>
  );
}
