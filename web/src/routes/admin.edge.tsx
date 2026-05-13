import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Globe2, Plus, RadioTower, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  adminEdgeQuery,
  useAdminCreateEdgeRegion,
  useAdminDeleteEdgeNode,
  useAdminDisableEdgeRegion,
  useAdminDrainEdgeNode,
  type AdminEdgeNode,
  type AdminEdgeRegion,
} from '@/lib/admin';
import { ApiError } from '@/lib/api';
import {
  Button,
  Card,
  CopyableId,
  EmptyState,
  ErrorText,
  Field,
  Input,
  PageHeader,
  RelativeTime,
  Stack,
  StatCard,
  StatusPill,
  type SemanticStatus,
} from '@/components/ui';

export const Route = createFileRoute('/admin/edge')({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminEdgeQuery),
  component: AdminEdgePage,
});

function AdminEdgePage() {
  const edge = useQuery({ ...adminEdgeQuery, refetchInterval: 10_000 });
  const data = edge.data;

  return (
    <Stack gap={6}>
      <PageHeader
        title="Edge"
        subtitle="Global custom-domain ingress. Users CNAME domains to the platform edge."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          label="DNS target"
          value={data?.edge_hostname ?? 'edge.driftbase.app'}
          hint="CNAME target"
          mono
        />
        <StatCard
          label="Edge IPs"
          value={data?.edge_ips.length ?? 0}
          hint={(data?.edge_ips ?? []).join(', ') || 'none ready'}
          mono
        />
        <StatCard
          label="Routes"
          value={data?.route_count ?? 0}
          hint="active hostnames"
          mono
        />
      </div>

      <DnsPanel hostname={data?.edge_hostname ?? 'edge.driftbase.app'} ips={data?.edge_ips ?? []} />

      <CreateRegion />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Regions</h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              V1 runs one edge node per region. Add more regions after DNS is ready.
            </p>
          </div>
          <Link to="/admin" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]">
            Admin overview
          </Link>
        </div>
        {data && data.regions.length === 0 ? (
          <EmptyState
            title="No edge regions"
            body="Deploy a region to start accepting CNAME-based custom domains."
          />
        ) : (
          <Stack gap={3}>
            {(data?.regions ?? []).map((region) => (
              <RegionCard key={region.id} region={region} />
            ))}
          </Stack>
        )}
      </section>
    </Stack>
  );
}

function DnsPanel({ hostname, ips }: { hostname: string; ips: string[] }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Globe2 className="h-4 w-4 text-[var(--color-muted)]" />
        <h2 className="text-sm font-medium">DNS operations</h2>
      </div>
      <div className="grid gap-2 font-mono text-xs md:grid-cols-[auto_1fr_auto]">
        <span className="text-[var(--color-muted)]">CNAME</span>
        <span>{hostname}</span>
        <CopyableId value={hostname} display="copy" />
        <span className="text-[var(--color-muted)]">A fallback</span>
        <span>{ips.length > 0 ? ips.join(', ') : 'no ready edge IPs'}</span>
        <span />
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Update DNS for this hostname outside Driftbase in v1. Users point their
        custom hostnames at this target.
      </p>
    </Card>
  );
}

function CreateRegion() {
  const create = useAdminCreateEdgeRegion();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('fsn1');
  const [serverType, setServerType] = useState('cx22');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim() || undefined,
        location: location.trim(),
        server_type: serverType.trim() || undefined,
      });
      setName('');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to deploy edge region',
      );
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit} className="grid items-end gap-3 md:grid-cols-[1fr_120px_120px_auto]">
        <Field label="Region name" htmlFor="edge-region-name" hint="defaults to location">
          <Input
            id="edge-region-name"
            placeholder="eu-central"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Location" htmlFor="edge-location">
          <Input
            id="edge-location"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <Field label="Server type" htmlFor="edge-server-type">
          <Input
            id="edge-server-type"
            value={serverType}
            onChange={(e) => setServerType(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={create.isPending}>
          <Plus className="mr-1.5 h-4 w-4" />
          {create.isPending ? 'Deploying' : 'Deploy region'}
        </Button>
      </form>
      {error ? (
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}
    </Card>
  );
}

function RegionCard({ region }: { region: AdminEdgeRegion }) {
  const disable = useAdminDisableEdgeRegion();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill status={region.status === 'active' ? 'ok' : 'warn'} label={region.status} />
            <h3 className="text-sm font-medium">{region.name}</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {region.location} · {region.server_type} · created{' '}
            <RelativeTime date={region.created_at} />
          </p>
        </div>
        {region.status === 'active' ? (
          <Button
            variant="ghost"
            onClick={() => disable.mutate(region.id)}
            disabled={disable.isPending}
          >
            Disable
          </Button>
        ) : null}
      </div>
      {region.nodes.length === 0 ? (
        <EmptyState title="No edge nodes" body="The provisioner has not created a node yet." className="border-0" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Node</th>
                <th className="px-4 py-2 font-medium">Network</th>
                <th className="px-4 py-2 font-medium">Sync</th>
                <th className="px-4 py-2 font-medium">Routes</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {region.nodes.map((node) => (
                <EdgeNodeRow key={node.id} node={node} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function EdgeNodeRow({ node }: { node: AdminEdgeNode }) {
  const drain = useAdminDrainEdgeNode();
  const del = useAdminDeleteEdgeNode();
  const error = node.caddy_sync_error ?? node.private_network_sync_error ?? node.last_error;

  return (
    <tr className="border-t border-[var(--color-border)] align-top">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusPill status={statusTone(node.status)} label={node.status} pulse={node.status === 'provisioning'} />
          <RadioTower className="h-3.5 w-3.5 text-[var(--color-muted)]" />
        </div>
        <div className="mt-1 font-mono text-xs">{node.name}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <CopyableId value={node.id} display={node.id.slice(0, 8)} />
          <span>·</span>
          <span>{node.hetzner_location ?? 'unknown'}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="font-mono text-xs">{node.public_ipv4 ?? 'no public ip'}</div>
        <div className="mt-1 font-mono text-xs text-[var(--color-muted)]">
          {node.wireguard_mesh_ip ?? 'no mesh ip'}
        </div>
        <div className="mt-1 text-xs text-[var(--color-muted)]">
          {node.agent_version ?? 'unknown version'}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-xs">
          Caddy{' '}
          {node.caddy_synced_at ? <RelativeTime date={node.caddy_synced_at} /> : 'never'}
        </div>
        <div className="mt-1 text-xs text-[var(--color-muted)]">
          WireGuard{' '}
          {node.private_network_synced_at ? (
            <RelativeTime date={node.private_network_synced_at} />
          ) : (
            'never'
          )}
        </div>
        {error ? <div className="mt-1 max-w-[260px] truncate text-xs text-red-400">{error}</div> : null}
      </td>
      <td className="px-4 py-3 font-mono text-xs">{node.route_count}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          <Button
            variant="ghost"
            onClick={() => drain.mutate(node.id)}
            disabled={drain.isPending || node.status === 'draining'}
          >
            Drain
          </Button>
          <Button
            variant="danger"
            onClick={() => del.mutate(node.id)}
            disabled={del.isPending}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

function statusTone(status: string): SemanticStatus {
  switch (status) {
    case 'ready':
      return 'ok';
    case 'error':
    case 'terminated':
      return 'error';
    case 'provisioning':
    case 'draining':
    default:
      return 'warn';
  }
}
