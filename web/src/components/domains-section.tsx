import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Check, Copy, ExternalLink, Info, Plus, Trash2, X } from 'lucide-react';
import {
  useAddDomain,
  useDeleteDomain,
  useUpdateDomain,
  domainsQuery,
} from '@/lib/domains';
import { serviceDeploymentsQuery } from '@/lib/services';
import { nodesQuery } from '@/lib/nodes';
import { ApiError } from '@/lib/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  RelativeTime,
  Stack,
  StatusPill,
  type SemanticStatus,
} from '@/components/ui';
import type { DomainSummary, TlsStatus } from '@/lib/types';

const TLS_META: Record<
  TlsStatus,
  { status: SemanticStatus; label: string; pulse: boolean }
> = {
  pending: { status: 'warn', label: 'pending', pulse: true },
  active: { status: 'ok', label: 'active', pulse: false },
  failed: { status: 'error', label: 'failed', pulse: false },
};

interface Props {
  workspaceSlug: string;
  projectSlug: string;
  serviceSlug: string;
  canManage: boolean;
  defaultPort?: number | null;
}

export function DomainsSection({
  workspaceSlug,
  projectSlug,
  serviceSlug,
  canManage,
  defaultPort,
}: Props) {
  const domains = useQuery(domainsQuery(workspaceSlug, projectSlug, serviceSlug));
  const add = useAddDomain(workspaceSlug, projectSlug, serviceSlug);
  const del = useDeleteDomain(workspaceSlug, projectSlug, serviceSlug);
  const updateDomain = useUpdateDomain(workspaceSlug, projectSlug, serviceSlug);
  const nodes = useQuery(nodesQuery(workspaceSlug));
  const deployments = useQuery(
    serviceDeploymentsQuery(workspaceSlug, projectSlug, serviceSlug),
  );

  const routedDeployment = deployments.data?.find(
    (d) => d.node_id && !['stopped', 'errored'].includes(d.status),
  );
  const routeNode = nodes.data?.find((n) => n.id === routedDeployment?.node_id);
  const nodeIp = routeNode?.public_ipv4 ?? null;

  const list = domains.data ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const showAddCard = canManage && (addOpen || list.length === 0);

  return (
    <Stack gap={4}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Domains</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {list.length === 0
              ? 'No hostnames routed to this service yet.'
              : `${list.length} hostname${list.length === 1 ? '' : 's'} routed to this service.`}
          </p>
        </div>
        {canManage && list.length > 0 ? (
          <Button
            variant={addOpen ? 'ghost' : 'secondary'}
            onClick={() => setAddOpen((v) => !v)}
          >
            {addOpen ? (
              <>
                <X className="mr-1.5 h-4 w-4" /> Cancel
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-4 w-4" /> Add domain
              </>
            )}
          </Button>
        ) : null}
      </div>

      {showAddCard ? (
        <AddDomainCard
          defaultPort={defaultPort}
          nodeIp={nodeIp}
          onSubmit={async (body) => {
            await add.mutateAsync(body);
            setAddOpen(false);
          }}
          pending={add.isPending}
        />
      ) : null}

      {list.length === 0 ? (
        !showAddCard ? (
          <EmptyState
            title="No domains yet"
            body="Route a custom hostname to this service and Caddy will issue TLS on first HTTPS request."
          />
        ) : null
      ) : (
        <Stack gap={2}>
          {list.map((d) => (
            <DomainRow
              key={d.id}
              domain={d}
              canManage={canManage}
              nodeIp={nodeIp}
              onUpdatePort={(port) =>
                updateDomain.mutateAsync({ id: d.id, container_port: port })
              }
              onDelete={() => del.mutate(d.id)}
              deleting={del.isPending && del.variables === d.id}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/* ---------- add form ---------- */

function AddDomainCard({
  defaultPort,
  nodeIp,
  pending,
  onSubmit,
}: {
  defaultPort?: number | null;
  nodeIp: string | null;
  pending: boolean;
  onSubmit: (body: { hostname: string; container_port?: number }) => Promise<void>;
}) {
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('');
  const [error, setError] = useState<string | null>(null);

  const normalized = hostname.trim().toLowerCase();

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      const body: { hostname: string; container_port?: number } = {
        hostname: normalized,
      };
      if (port.trim()) {
        const n = Number(port);
        if (!Number.isFinite(n)) throw new Error('invalid port');
        body.container_port = n;
      }
      await onSubmit(body);
      setHostname('');
      setPort('');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed',
      );
    }
  }

  return (
    <Card className="p-5">
      <form
        onSubmit={handle}
        className="grid grid-cols-[1fr_140px_auto] items-end gap-3"
      >
        <Field label="Hostname" htmlFor="dom-host">
          <Input
            id="dom-host"
            required
            autoFocus
            placeholder="api.example.com"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
          />
        </Field>
        <Field
          label="Port"
          htmlFor="dom-port"
          hint={defaultPort ? `default: ${defaultPort}` : '80, 3000, …'}
        >
          <Input
            id="dom-port"
            type="number"
            min={1}
            max={65535}
            placeholder={String(defaultPort ?? 80)}
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add domain'}
        </Button>
      </form>

      {error ? (
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}

      <DnsRecordPreview hostname={normalized} nodeIp={nodeIp} />
    </Card>
  );
}

function DnsRecordPreview({
  hostname,
  nodeIp,
}: {
  hostname: string;
  nodeIp: string | null;
}) {
  const recordName = dnsRecordName(hostname);
  const ip = nodeIp ?? '—';

  return (
    <div className="mt-5 rounded-md border border-[var(--color-border)] bg-black/[0.02] p-3 dark:bg-white/[0.02]">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted)]">
        <Info className="h-3 w-3" />
        DNS record
      </div>
      <div className="grid grid-cols-[auto_auto_auto_auto_1fr_auto] items-center gap-x-3 gap-y-1 font-mono text-xs">
        <DnsCell label="type" value="A" />
        <DnsCell label="name" value={recordName || '—'} copyable={recordName} />
        <DnsCell label="value" value={ip} copyable={nodeIp ?? ''} />
        <DnsCell label="ttl" value="auto" />
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        {nodeIp
          ? 'Caddy issues TLS on the first HTTPS request. Propagation usually takes a minute.'
          : 'Deploy the service first — a node IP is needed before DNS can point anywhere.'}
      </p>
    </div>
  );
}

function DnsCell({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable?: string;
}) {
  return (
    <>
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="col-span-4 flex items-center gap-2">
        <span>{value}</span>
        {copyable ? <CopyBtn value={copyable} /> : null}
      </span>
    </>
  );
}

/* ---------- domain row ---------- */

function DomainRow({
  domain,
  canManage,
  nodeIp,
  onUpdatePort,
  onDelete,
  deleting,
}: {
  domain: DomainSummary;
  canManage: boolean;
  nodeIp: string | null;
  onUpdatePort: (port: number) => Promise<DomainSummary>;
  onDelete: () => void;
  deleting: boolean;
}) {
  const meta = TLS_META[domain.tls_status];
  const needsSetup = domain.tls_status !== 'active';

  return (
    <Card className="group p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <a
            href={`https://${domain.hostname}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 truncate font-mono text-sm font-medium hover:text-[var(--color-accent)]"
          >
            <span className="truncate">{domain.hostname}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
          </a>
          <div className="mt-1 flex items-center gap-3 text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <span>port</span>
              {canManage ? (
                <PortCell domain={domain} onSave={onUpdatePort} />
              ) : (
                <span className="font-mono text-[var(--color-fg)]">
                  {domain.container_port}
                </span>
              )}
            </span>
            <span className="text-[var(--color-subtle)]">·</span>
            <span>
              added <RelativeTime date={domain.created_at} className="!text-[var(--color-muted)]" />
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <StatusPill status={meta.status} label={meta.label} pulse={meta.pulse} />
          {canManage ? (
            <ConfirmDelete onConfirm={onDelete} pending={deleting} />
          ) : null}
        </div>
      </div>

      {needsSetup || domain.last_error ? (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          {domain.tls_status === 'pending' ? (
            <PendingHelp hostname={domain.hostname} nodeIp={nodeIp} />
          ) : null}
          {domain.tls_status === 'failed' && domain.last_error ? (
            <p className="text-xs text-red-400">{domain.last_error}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function PendingHelp({
  hostname,
  nodeIp,
}: {
  hostname: string;
  nodeIp: string | null;
}) {
  const name = dnsRecordName(hostname);
  const ip = nodeIp ?? '<your node IP>';
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
      <span>Point DNS at this node, then HTTPS issues the cert:</span>
      <span className="inline-flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-black/[0.03] px-1.5 py-0.5 font-mono text-[var(--color-fg)] dark:bg-white/[0.03]">
        A {name} → {ip}
      </span>
      {nodeIp ? <CopyBtn value={nodeIp} /> : null}
    </div>
  );
}

function ConfirmDelete({
  onConfirm,
  pending,
}: {
  onConfirm: () => void;
  pending: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  if (pending) {
    return (
      <span className="text-xs text-[var(--color-muted)]">Deleting…</span>
    );
  }

  if (armed) {
    return (
      <button
        type="button"
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
        className="inline-flex h-7 items-center rounded-md border border-red-500/60 px-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
      >
        Confirm delete
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      aria-label="Delete domain"
      title="Delete domain"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-red-500/10 hover:text-red-400"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/* ---------- port cell ---------- */

function PortCell({
  domain,
  onSave,
}: {
  domain: DomainSummary;
  onSave: (port: number) => Promise<DomainSummary>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(domain.container_port));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setValue(String(domain.container_port));
  }, [domain.container_port, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      setError(true);
      return;
    }
    if (n === domain.container_port) {
      setEditing(false);
      setError(false);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      await onSave(n);
      setEditing(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(String(domain.container_port));
    setEditing(false);
    setError(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={1}
        max={65535}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
        className={[
          'h-6 w-16 rounded border bg-transparent px-1.5 font-mono text-xs focus:outline-none',
          error
            ? 'border-red-500/60 focus:border-red-500'
            : 'border-[var(--color-border)] focus:border-[var(--color-accent)]',
        ].join(' ')}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit"
      className="rounded px-1 font-mono text-[var(--color-fg)] hover:bg-black/5 dark:hover:bg-white/5"
    >
      {domain.container_port}
    </button>
  );
}

/* ---------- copy button ---------- */

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      aria-label="Copy"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

/* ---------- helpers ---------- */

/** `api.example.com` → `api`, `example.com` → `@`. */
function dnsRecordName(hostname: string): string {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length <= 2) return '@';
  return parts.slice(0, parts.length - 2).join('.');
}
