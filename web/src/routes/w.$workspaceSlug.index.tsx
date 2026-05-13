import { createFileRoute, Link } from '@tanstack/react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Plus, Moon } from 'lucide-react';
import { workspaceQuery, canWrite } from '@/lib/workspaces';
import { projectsQuery } from '@/lib/projects';
import { servicesQuery, serviceDeploymentsQuery } from '@/lib/services';
import { meQuery } from '@/lib/auth';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  RelativeTime,
  Stack,
  StatCard,
  StatusDot,
  type SemanticStatus,
} from '@/components/ui';
import type { DeploymentStatus, DeploymentSummary, ServiceSummary } from '@/lib/types';

export const Route = createFileRoute('/w/$workspaceSlug/')({
  component: OverviewPage,
});

interface DeployBlip {
  serviceSlug: string;
  serviceName: string;
  projectSlug: string;
  deployment: DeploymentSummary;
}

function OverviewPage() {
  const { workspaceSlug } = Route.useParams();
  const me = useQuery(meQuery);
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const projects = useQuery(projectsQuery(workspaceSlug));

  const projectList = projects.data ?? [];

  const services = useQueries({
    queries: projectList.map((p) => servicesQuery(workspaceSlug, p.slug)),
  });

  const flatServices = useMemo(() => {
    const out: { projectSlug: string; service: ServiceSummary }[] = [];
    services.forEach((q, i) => {
      const p = projectList[i];
      if (!p || !q.data) return;
      for (const s of q.data) out.push({ projectSlug: p.slug, service: s });
    });
    return out;
  }, [services, projectList]);

  const deployments = useQueries({
    queries: flatServices.map(({ projectSlug, service }) => ({
      ...serviceDeploymentsQuery(workspaceSlug, projectSlug, service.slug),
      refetchInterval: 8000,
    })),
  });

  const stats = useMemo(() => {
    let running = 0;
    let inFlight = 0;
    let errored = 0;
    for (const q of deployments) {
      const latest = (q.data as DeploymentSummary[] | undefined)?.[0];
      if (!latest) continue;
      if (latest.status === 'running') running++;
      else if (isInFlight(latest.status)) inFlight++;
      else if (latest.status === 'errored' || latest.status === 'failing') errored++;
    }
    return {
      projects: projectList.length,
      services: flatServices.length,
      running,
      inFlight,
      errored,
    };
  }, [deployments, projectList.length, flatServices.length]);

  const recent = useMemo<DeployBlip[]>(() => {
    const blips: DeployBlip[] = [];
    deployments.forEach((q, i) => {
      const latest = (q.data as DeploymentSummary[] | undefined)?.[0];
      const meta = flatServices[i];
      if (!latest || !meta) return;
      blips.push({
        serviceSlug: meta.service.slug,
        serviceName: meta.service.name,
        projectSlug: meta.projectSlug,
        deployment: latest,
      });
    });
    return blips
      .sort(
        (a, b) =>
          new Date(b.deployment.updated_at).getTime() -
          new Date(a.deployment.updated_at).getTime(),
      )
      .slice(0, 5);
  }, [deployments, flatServices]);

  const projectServiceCounts = useMemo(() => {
    const counts: Record<string, { total: number; running: number; errored: number }> = {};
    deployments.forEach((q, i) => {
      const meta = flatServices[i];
      if (!meta) return;
      const c = counts[meta.projectSlug] ?? { total: 0, running: 0, errored: 0 };
      c.total++;
      const latest = (q.data as DeploymentSummary[] | undefined)?.[0];
      if (latest?.status === 'running') c.running++;
      if (latest?.status === 'errored' || latest?.status === 'failing') c.errored++;
      counts[meta.projectSlug] = c;
    });
    return counts;
  }, [deployments, flatServices]);

  const canCreate = canWrite(workspace.data);
  const firstName = me.data?.display_name?.split(' ')[0] ?? '';

  return (
    <Stack gap={8}>
      <PageHeader
        title={
          <>
            {firstName ? `Welcome back, ${firstName}` : (workspace.data?.name ?? workspaceSlug)}
          </>
        }
        subtitle={
          <span className="font-mono text-xs">
            {workspace.data?.name ?? workspaceSlug} · {workspace.data?.role ?? '—'}
          </span>
        }
        actions={
          canCreate ? (
            <Link to="/w/$workspaceSlug/projects" params={{ workspaceSlug }}>
              <Button>
                <Plus className="mr-1 h-3.5 w-3.5" /> Project
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Projects"
          value={<span className="font-mono">{stats.projects}</span>}
        />
        <StatCard
          label="Services"
          value={<span className="font-mono">{stats.services}</span>}
          hint={
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <StatusDot status="ok" />
                {stats.running} running
              </span>
              {stats.inFlight > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <StatusDot status="warn" pulse />
                  {stats.inFlight} active
                </span>
              ) : null}
            </span>
          }
        />
        <StatCard
          label="Health"
          value={
            stats.errored > 0 ? (
              <span className="text-red-400">{stats.errored} errored</span>
            ) : stats.inFlight > 0 ? (
              <span className="text-amber-400">deploying</span>
            ) : stats.running > 0 ? (
              <span className="text-emerald-400">all good</span>
            ) : (
              <span className="text-[var(--color-muted)]">idle</span>
            )
          }
          hint={
            stats.errored === 0 && stats.running > 0
              ? 'no issues across services'
              : undefined
          }
        />
        <StatCard
          label="Member since"
          value={
            workspace.data?.created_at ? (
              <span className="text-sm font-normal">
                <RelativeTime date={workspace.data.created_at} />
              </span>
            ) : (
              '—'
            )
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
          <Link
            to="/w/$workspaceSlug/projects"
            params={{ workspaceSlug }}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          >
            view projects →
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title={
              <span className="inline-flex items-center gap-2">
                <Moon className="h-4 w-4 text-[var(--color-muted)]" />
                Quiet around here
              </span>
            }
            body="No deployments yet. Once you ship a service, its activity will appear here."
          />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-[var(--color-border)]">
              {recent.map((blip) => (
                <ActivityRow
                  key={blip.deployment.id}
                  workspaceSlug={workspaceSlug}
                  blip={blip}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Your projects</h2>
          <span className="text-xs text-[var(--color-muted)]">{projectList.length} total</span>
        </div>
        {projectList.length === 0 ? (
          <EmptyState
            title="No projects yet"
            body="A project groups related services. Create one to get started."
            cta={
              canCreate ? (
                <Link to="/w/$workspaceSlug/projects" params={{ workspaceSlug }}>
                  <Button>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Create project
                  </Button>
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projectList.map((p) => {
              const c = projectServiceCounts[p.slug];
              const tone: SemanticStatus =
                (c?.errored ?? 0) > 0
                  ? 'error'
                  : (c?.running ?? 0) > 0
                  ? 'ok'
                  : 'muted';
              return (
                <Link
                  key={p.id}
                  to="/w/$workspaceSlug/projects/$projectSlug"
                  params={{ workspaceSlug, projectSlug: p.slug }}
                  className="block"
                >
                  <Card className="px-4 py-3 transition-colors hover:border-[var(--color-border-strong)]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="truncate font-mono text-[11px] text-[var(--color-muted)]">
                          {p.slug}
                        </div>
                      </div>
                      <StatusDot status={tone} />
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-muted)]">
                      <span>{c?.total ?? 0} services</span>
                      {c && c.running > 0 ? <span>· {c.running} running</span> : null}
                      {c && c.errored > 0 ? (
                        <span className="text-red-400">· {c.errored} errored</span>
                      ) : null}
                    </div>
                  </Card>
                </Link>
              );
            })}
            {canCreate ? (
              <Link
                to="/w/$workspaceSlug/projects"
                params={{ workspaceSlug }}
                className="block"
              >
                <div
                  className={[
                    'flex h-full min-h-[88px] items-center justify-center rounded-lg border border-dashed',
                    'border-[var(--color-border)] text-xs text-[var(--color-muted)]',
                    'transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
                  ].join(' ')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> new project
                  </span>
                </div>
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </Stack>
  );
}

function ActivityRow({
  workspaceSlug,
  blip,
}: {
  workspaceSlug: string;
  blip: DeployBlip;
}) {
  const { deployment } = blip;
  const tone = statusTone(deployment.status);
  const pulsing = isInFlight(deployment.status);
  return (
    <li>
      <Link
        to="/w/$workspaceSlug/projects/$projectSlug/$serviceSlug"
        params={{
          workspaceSlug,
          projectSlug: blip.projectSlug,
          serviceSlug: blip.serviceSlug,
        }}
        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
      >
        <StatusDot status={tone} pulse={pulsing} />
        <span className="min-w-0 flex-1 truncate font-medium">{blip.serviceName}</span>
        <span className="hidden text-xs text-[var(--color-muted)] sm:inline">
          {deployment.status}
        </span>
        <span className="hidden truncate font-mono text-[11px] text-[var(--color-muted)] md:inline md:max-w-[200px]">
          {deployment.image_ref}
        </span>
        <span className="shrink-0 text-xs">
          <RelativeTime date={deployment.updated_at} />
        </span>
      </Link>
    </li>
  );
}

function statusTone(s: DeploymentStatus): SemanticStatus {
  if (s === 'running') return 'ok';
  if (s === 'errored' || s === 'failing') return 'error';
  if (s === 'stopped') return 'muted';
  return 'warn';
}

function isInFlight(s: DeploymentStatus): boolean {
  return (
    s === 'pending' ||
    s === 'building' ||
    s === 'placing' ||
    s === 'pulling' ||
    s === 'starting'
  );
}
