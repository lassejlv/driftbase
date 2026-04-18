import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import {
  serviceQuery,
  serviceDeploymentsQuery,
  useDeleteService,
  useDeployService,
} from '@/lib/services';
import {
  deploymentTone,
  useRestartDeployment,
  useStopDeployment,
} from '@/lib/deployments';
import { canAdmin, canWrite, workspaceQuery } from '@/lib/workspaces';
import { ApiError } from '@/lib/api';
import {
  Button,
  Card,
  CopyableId,
  ErrorText,
  Inline,
  RelativeTime,
  Stack,
  StatusPill,
  type SemanticStatus,
} from '@/components/ui';
import { DomainsSection } from '@/components/domains-section';
import { ServiceMetricsTab } from '@/components/service-metrics';
import { EnvVarsSection, ServiceSettingsTab } from '@/components/service-settings';
import { ServiceVolumeTab } from '@/components/service-volume';
import { buildsQuery, buildTone } from '@/lib/builds';
import { spring, tabSwap } from '@/lib/motion-presets';
import type { BuildSummary, DeploymentSummary, ServiceSummary } from '@/lib/types';

export type InspectorTab =
  | 'deployments'
  | 'metrics'
  | 'builds'
  | 'domains'
  | 'volume'
  | 'logs'
  | 'variables'
  | 'settings';

export interface ServiceStatus {
  tone: SemanticStatus;
  label: string;
  pulse: boolean;
}

interface Props {
  workspaceSlug: string;
  projectSlug: string;
  serviceSlug: string;
  variant?: 'page' | 'drawer';
  /** Controlled active tab. If omitted, the inspector owns tab state. */
  tab?: InspectorTab;
  /** Called when the user picks a tab. Required when `tab` is provided. */
  onTabChange?: (tab: InspectorTab) => void;
  /** Called when the service is deleted — the caller typically navigates away. */
  onDeleted?: () => void;
}

export function ServiceInspector({
  workspaceSlug,
  projectSlug,
  serviceSlug,
  variant = 'page',
  tab: tabProp,
  onTabChange,
  onDeleted,
}: Props) {
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const service = useQuery(serviceQuery(workspaceSlug, projectSlug, serviceSlug));
  const deployments = useQuery({
    ...serviceDeploymentsQuery(workspaceSlug, projectSlug, serviceSlug),
    refetchInterval: 3000,
  });
  const deploy = useDeployService(workspaceSlug, projectSlug, serviceSlug);
  const deleteService = useDeleteService(workspaceSlug, projectSlug);
  const stop = useStopDeployment();
  const restart = useRestartDeployment();

  const canDeploy = canWrite(workspace.data);
  const canDelete = canAdmin(workspace.data);
  const shouldReduce = useReducedMotion();

  const [error, setError] = useState<string | null>(null);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [internalTab, setInternalTab] = useState<InspectorTab>('deployments');
  const tab = tabProp ?? internalTab;
  const setTab = (t: InspectorTab) => {
    if (onTabChange) onTabChange(t);
    if (tabProp === undefined) setInternalTab(t);
  };

  const latest = deployments.data?.[0];
  useEffect(() => {
    if (!activeDeploymentId && latest) {
      setActiveDeploymentId(latest.id);
    }
  }, [activeDeploymentId, latest]);

  async function onDeploy() {
    setError(null);
    try {
      const d = await deploy.mutateAsync();
      setActiveDeploymentId(d.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Deploy failed');
    }
  }

  useEffect(() => {
    if (!canDeploy) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void onDeploy();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDeploy]);

  const svc = service.data;
  const serviceStatus = computeServiceStatus(latest);
  const deployLabel = computeDeployLabel(latest);
  const isDrawer = variant === 'drawer';

  async function onDelete() {
    if (!confirm(`Delete service ${serviceSlug}? This cannot be undone.`)) return;
    try {
      await deleteService.mutateAsync(serviceSlug);
      if (onDeleted) onDeleted();
      else window.location.href = `/w/${workspaceSlug}/projects/${projectSlug}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  return (
    <Stack gap={isDrawer ? 4 : 5}>
      <TabsBar value={tab} onChange={setTab} />

      <Inline gap={3} wrap>
        <StatusPill
          status={serviceStatus.tone}
          label={serviceStatus.label}
          pulse={serviceStatus.pulse}
        />
        <span className="min-w-0 truncate font-mono text-[11px] text-[var(--color-muted)]">
          {service.data ? <ServiceSubtitle service={service.data} /> : '—'}
        </span>
      </Inline>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          variants={tabSwap}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={shouldReduce ? { duration: 0 } : spring.snappy}
        >
          {renderTabBody(tab, {
            svc,
            workspaceSlug,
            projectSlug,
            serviceSlug,
            canDeploy,
            canDelete,
            deployments: deployments.data ?? [],
            activeDeploymentId,
            setActiveDeploymentId,
            setTab,
            deployLabel,
            isDeploying: deploy.isPending,
            onDeploy,
            onDelete,
            onRestart: (id: string) => restart.mutate(id),
            onStop: (id: string) => stop.mutate(id),
          })}
        </motion.div>
      </AnimatePresence>
    </Stack>
  );
}

interface TabBodyArgs {
  svc: ServiceSummary | undefined;
  workspaceSlug: string;
  projectSlug: string;
  serviceSlug: string;
  canDeploy: boolean;
  canDelete: boolean;
  deployments: DeploymentSummary[];
  activeDeploymentId: string | null;
  setActiveDeploymentId: (id: string | null) => void;
  setTab: (t: InspectorTab) => void;
  deployLabel: string;
  isDeploying: boolean;
  onDeploy: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onRestart: (id: string) => void;
  onStop: (id: string) => void;
}

function renderTabBody(tab: InspectorTab, a: TabBodyArgs): ReactNode {
  switch (tab) {
    case 'metrics':
      return a.svc ? (
        <ServiceMetricsTab
          service={a.svc}
          workspaceSlug={a.workspaceSlug}
          projectSlug={a.projectSlug}
          serviceSlug={a.serviceSlug}
        />
      ) : null;
    case 'deployments':
      return (
        <Stack gap={3}>
          {a.canDeploy || a.canDelete ? (
            <Inline gap={2} justify="end">
              {a.canDeploy ? (
                <Button onClick={a.onDeploy} disabled={a.isDeploying} title="⌘ ↵">
                  {a.isDeploying ? 'Deploying…' : a.deployLabel}
                </Button>
              ) : null}
              {a.canDelete ? (
                <Button variant="danger" onClick={a.onDelete} title="Delete service">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </Inline>
          ) : null}
          <DeploymentsTable
            deployments={a.deployments}
            canManage={a.canDeploy}
            activeId={a.activeDeploymentId}
            onSelect={(id) => {
              a.setActiveDeploymentId(id);
              a.setTab('logs');
            }}
            onStop={a.onStop}
            onRestart={a.onRestart}
          />
        </Stack>
      );
    case 'volume':
      return a.svc ? (
        <ServiceVolumeTab
          service={a.svc}
          workspaceSlug={a.workspaceSlug}
          projectSlug={a.projectSlug}
          canManage={a.canDeploy}
        />
      ) : null;
    case 'domains':
      return (
        <DomainsSection
          workspaceSlug={a.workspaceSlug}
          projectSlug={a.projectSlug}
          serviceSlug={a.serviceSlug}
          canManage={a.canDeploy}
          defaultPort={a.svc?.ports?.[0]?.container_port ?? null}
        />
      );
    case 'builds':
      return (
        <BuildsTab
          workspaceSlug={a.workspaceSlug}
          projectSlug={a.projectSlug}
          serviceSlug={a.serviceSlug}
          onViewLogs={(deploymentId) => {
            a.setActiveDeploymentId(deploymentId);
            a.setTab('logs');
          }}
        />
      );
    case 'logs':
      return (
        <LogsTab
          deployments={a.deployments}
          activeId={a.activeDeploymentId}
          onSelect={a.setActiveDeploymentId}
        />
      );
    case 'variables':
      return a.svc ? (
        <EnvVarsSection
          service={a.svc}
          workspaceSlug={a.workspaceSlug}
          projectSlug={a.projectSlug}
          canManage={a.canDeploy}
        />
      ) : null;
    case 'settings':
      return a.svc ? (
        <ServiceSettingsTab
          service={a.svc}
          workspaceSlug={a.workspaceSlug}
          projectSlug={a.projectSlug}
          canManage={a.canDeploy}
        />
      ) : null;
  }
}

/* ---------- status ---------- */

export function computeServiceStatus(d: DeploymentSummary | undefined): ServiceStatus {
  const { tone, pulse } = deploymentTone(d?.status);
  const label = !d
    ? 'never deployed'
    : d.status === 'building'
      ? 'building'
      : d.status === 'pulling'
        ? 'pulling image'
        : d.status === 'pending' || d.status === 'placing'
          ? 'pending'
          : d.status;
  return { tone, label, pulse };
}

function computeDeployLabel(latest: DeploymentSummary | undefined): string {
  if (!latest) return 'Deploy';
  if (['pending', 'building', 'placing', 'pulling', 'starting'].includes(latest.status))
    return 'Deploying…';
  if (latest.status === 'running') return 'Redeploy';
  return 'Deploy';
}

export function ServiceSubtitle({ service }: { service: ServiceSummary }) {
  if (service.source === 'git' && service.git_repo) {
    return (
      <span className="font-mono text-xs">
        {service.git_repo}
        {service.git_branch ? <>@{service.git_branch}</> : null}
        {service.git_commit ? (
          <span className="text-[var(--color-muted)]"> · {service.git_commit.slice(0, 7)}</span>
        ) : null}
      </span>
    );
  }
  return service.image_ref ? (
    <span className="font-mono text-xs">{service.image_ref}</span>
  ) : (
    <>—</>
  );
}

/* ---------- tabs ---------- */

function TabsBar({
  value,
  onChange,
}: {
  value: InspectorTab;
  onChange: (t: InspectorTab) => void;
}) {
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: 'deployments', label: 'Deployments' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'builds', label: 'Builds' },
    { id: 'domains', label: 'Domains' },
    { id: 'volume', label: 'Volume' },
    { id: 'logs', label: 'Logs' },
    { id: 'variables', label: 'Variables' },
    { id: 'settings', label: 'Settings' },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
              active
                ? 'border-[var(--color-accent)] text-[var(--color-fg)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- deployments ---------- */

function DeploymentsTable({
  deployments,
  canManage,
  activeId,
  onSelect,
  onStop,
  onRestart,
}: {
  deployments: DeploymentSummary[];
  canManage: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Image</th>
              <th className="px-4 py-2.5 font-medium">Started</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {deployments.length ? (
              deployments.map((d) => (
                <DeploymentRow
                  key={d.id}
                  d={d}
                  active={activeId === d.id}
                  canManage={canManage}
                  onSelect={() => onSelect(d.id)}
                  onStop={() => onStop(d.id)}
                  onRestart={() => onRestart(d.id)}
                  showDuration
                  showReason
                  showImage
                />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
                  No deployments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DeploymentRow({
  d,
  active,
  canManage,
  onSelect,
  onStop,
  onRestart,
  showDuration = false,
  showReason = false,
  showImage = true,
}: {
  d: DeploymentSummary;
  active: boolean;
  canManage: boolean;
  onSelect: () => void;
  onStop: () => void;
  onRestart: () => void;
  showDuration?: boolean;
  showReason?: boolean;
  showImage?: boolean;
}) {
  const stoppable =
    d.status === 'running' || d.status === 'starting' || d.status === 'pulling';
  const status = deploymentTone(d.status);
  return (
    <tr
      className={[
        'cursor-pointer border-t border-[var(--color-border)]',
        active ? 'bg-black/5 dark:bg-white/5' : 'hover:bg-black/3 dark:hover:bg-white/2',
      ].join(' ')}
      onClick={onSelect}
    >
      <td className="px-4 py-2">
        <StatusPill status={status.tone} label={d.status} pulse={status.pulse} />
      </td>
      {showImage ? (
        <td className="px-4 py-2">
          <CopyableId value={d.image_ref} display={truncateImage(d.image_ref)} />
        </td>
      ) : null}
      <td className="px-4 py-2 text-xs text-[var(--color-muted)]">
        <RelativeTime date={d.created_at} />
      </td>
      {showDuration ? (
        <td className="px-4 py-2 font-mono text-xs text-[var(--color-muted)]">
          {formatDuration(d)}
        </td>
      ) : null}
      {showReason ? (
        <td className="max-w-sm px-4 py-2 text-xs text-[var(--color-muted)]">
          {d.reason ? <span className="whitespace-pre-wrap break-words">{d.reason}</span> : '—'}
        </td>
      ) : null}
      <td className="px-4 py-2 text-right">
        {canManage ? (
          <div className="flex justify-end gap-2">
            {stoppable ? (
              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onStop();
                }}
              >
                Stop
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onRestart();
              }}
            >
              Restart
            </Button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function truncateImage(ref: string): string {
  if (ref.length <= 40) return ref;
  const host = ref.split('/')[0];
  const at = ref.indexOf('@');
  if (at !== -1) {
    const digest = ref.slice(at + 1);
    return `${host}/…@${digest.slice(0, 12)}…`;
  }
  const colon = ref.lastIndexOf(':');
  const slash = ref.lastIndexOf('/');
  if (colon > slash && colon !== -1) {
    const tag = ref.slice(colon + 1);
    const shownTag = tag.length > 24 ? `${tag.slice(0, 24)}…` : tag;
    return `${host}/…:${shownTag}`;
  }
  return ref.slice(0, 37) + '…';
}

function formatDuration(d: DeploymentSummary): string {
  const start = d.started_at ? new Date(d.started_at).getTime() : null;
  if (!start) return '—';
  const end = d.stopped_at ? new Date(d.stopped_at).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return `${hours}h`;
}

/* ---------- logs ---------- */

function LogsTab({
  deployments,
  activeId,
  onSelect,
}: {
  deployments: DeploymentSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (deployments.length === 0) {
    return (
      <Card className="px-6 py-10 text-center text-sm text-[var(--color-muted)]">
        No deployments yet. Deploy to stream logs.
      </Card>
    );
  }
  return (
    <Stack gap={3}>
      <Card className="p-3">
        <label className="flex items-center gap-3 text-xs">
          <span className="text-[var(--color-muted)]">Deployment</span>
          <select
            value={activeId ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-xs focus:border-[var(--color-accent)] focus:outline-none"
          >
            {deployments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.status} · {truncateImage(d.image_ref)} ·{' '}
                {new Date(d.created_at).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      </Card>
      {activeId ? <LogViewer deploymentId={activeId} /> : null}
    </Stack>
  );
}

interface LogEntry {
  stream: 'stdout' | 'stderr';
  ts: string;
  text: string;
}

function LogViewer({ deploymentId }: { deploymentId: string }) {
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [connState, setConnState] = useState<'connecting' | 'open' | 'closed' | 'error'>(
    'connecting',
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLines([]);
    setConnState('connecting');
    const url = `/api/v1/deployments/${encodeURIComponent(deploymentId)}/logs`;
    const es = new EventSource(url, { withCredentials: true });

    es.onopen = () => setConnState('open');
    es.addEventListener('log', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as LogEntry;
        setLines((prev) => {
          const next = prev.concat(data);
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
      } catch {
        // ignore malformed
      }
    });
    es.addEventListener('error', () => setConnState('error'));
    es.onerror = () => setConnState('error');

    return () => {
      es.close();
      setConnState('closed');
    };
  }, [deploymentId]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const stateTone: SemanticStatus =
    connState === 'open' ? 'ok' : connState === 'error' ? 'error' : 'muted';

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2 text-xs">
        <CopyableId value={deploymentId} display={deploymentId.slice(0, 8)} />
        <StatusPill
          status={stateTone}
          label={connState}
          pulse={connState === 'connecting'}
        />
      </div>
      <div
        ref={containerRef}
        className="max-h-[28rem] overflow-auto bg-black/30 p-3 font-mono text-xs"
      >
        {lines.length === 0 ? (
          <div className="text-[var(--color-muted)]">Waiting for logs…</div>
        ) : (
          lines.map((l, i) => (
            <div
              key={i}
              className={l.stream === 'stderr' ? 'text-red-300' : 'text-[var(--color-fg)]'}
            >
              <span className="mr-2 text-[var(--color-muted)]">
                {new Date(l.ts).toLocaleTimeString()}
              </span>
              {l.text}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/* ---------- builds ---------- */

function BuildsTab({
  workspaceSlug,
  projectSlug,
  serviceSlug,
  onViewLogs,
}: {
  workspaceSlug: string;
  projectSlug: string;
  serviceSlug: string;
  onViewLogs: (deploymentId: string) => void;
}) {
  const builds = useQuery({
    ...buildsQuery(workspaceSlug, projectSlug, serviceSlug),
    refetchInterval: 3000,
  });

  if (!builds.data || builds.data.length === 0) {
    return (
      <Card className="px-6 py-10 text-center text-sm text-[var(--color-muted)]">
        No builds yet. Set the service source to Git and hit Deploy to kick one off.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Commit</th>
              <th className="px-4 py-2.5 font-medium">Image</th>
              <th className="px-4 py-2.5 font-medium">Started</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {builds.data.map((b) => (
              <BuildRow key={b.id} b={b} onViewLogs={onViewLogs} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BuildRow({
  b,
  onViewLogs,
}: {
  b: BuildSummary;
  onViewLogs: (deploymentId: string) => void;
}) {
  const tone = buildTone(b.status);
  return (
    <tr className="border-t border-[var(--color-border)]">
      <td className="px-4 py-2">
        <StatusPill status={tone.tone} label={b.status} pulse={tone.pulse} />
      </td>
      <td className="px-4 py-2 font-mono text-xs">
        {b.git_commit ? b.git_commit.slice(0, 7) : '—'}
      </td>
      <td className="px-4 py-2">
        {b.image_digest ? (
          <CopyableId value={b.image_digest} display={shortDigest(b.image_digest)} />
        ) : b.image_tag ? (
          <span className="font-mono text-xs text-[var(--color-muted)]">
            {truncateImage(b.image_tag)}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-xs text-[var(--color-muted)]">
        <RelativeTime date={b.created_at} />
      </td>
      <td className="px-4 py-2 font-mono text-xs text-[var(--color-muted)]">
        {formatBuildDuration(b)}
      </td>
      <td className="max-w-sm px-4 py-2 text-xs text-[var(--color-muted)]">
        {b.reason ? <span className="whitespace-pre-wrap break-words">{b.reason}</span> : '—'}
      </td>
      <td className="px-4 py-2 text-right">
        {b.deployment_id ? (
          <Button variant="secondary" onClick={() => onViewLogs(b.deployment_id!)}>
            View logs
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function formatBuildDuration(b: BuildSummary): string {
  const start = b.started_at ? new Date(b.started_at).getTime() : null;
  if (!start) return '—';
  const end = b.finished_at ? new Date(b.finished_at).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m${secs % 60}s`;
  return `${Math.round(mins / 60)}h`;
}

function shortDigest(digest: string): string {
  const at = digest.indexOf(':');
  return at === -1 ? digest.slice(0, 12) : digest.slice(at + 1, at + 13);
}
