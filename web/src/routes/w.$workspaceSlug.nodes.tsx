import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { nodesQuery, useDeleteNode, useDrainNode } from '@/lib/nodes';
import { workspaceQuery } from '@/lib/workspaces';
import { Button, Card } from '@/components/ui';
import { ProvisionNodeSheet } from '@/components/provision-node-sheet';
import type { NodeSummary } from '@/lib/types';

export const Route = createFileRoute('/w/$workspaceSlug/nodes')({
  component: NodesPage,
});

function NodesPage() {
  const { workspaceSlug } = Route.useParams();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const nodes = useQuery({ ...nodesQuery(workspaceSlug), refetchInterval: 5000 });
  const drain = useDrainNode(workspaceSlug);
  const del = useDeleteNode(workspaceSlug);

  const canManage = workspace.data
    ? workspace.data.role === 'owner' || workspace.data.role === 'admin'
    : false;

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Nodes</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Compute capacity where containers run. Hetzner nodes provision automatically when
            capacity runs out; idle nodes are torn down after the autoscale TTL.
          </p>
        </div>
        {canManage ? (
          <ProvisionNodeSheet
            workspaceSlug={workspaceSlug}
            defaultLocation={workspace.data?.hetzner_location}
            defaultServerType={workspace.data?.default_server_type}
          >
            <Button>Provision node</Button>
          </ProvisionNodeSheet>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">CPU</th>
              <th className="px-4 py-2 font-medium">Memory</th>
              <th className="px-4 py-2 font-medium">Disk</th>
              <th className="px-4 py-2 font-medium">Seen</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {nodes.data?.length ? (
              nodes.data.map((n) => (
                <tr key={n.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2">{n.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{n.provider}</td>
                  <td className="px-4 py-2">
                    <span className={`font-mono text-xs ${statusColor(n.status)}`}>
                      {n.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{capacity(n, 'cpu')}</td>
                  <td className="px-4 py-2 font-mono text-xs">{capacity(n, 'mem')}</td>
                  <td className="px-4 py-2 font-mono text-xs">{capacity(n, 'disk')}</td>
                  <td className="px-4 py-2 text-xs text-[var(--color-muted)]">
                    {n.last_seen_at ? new Date(n.last_seen_at).toLocaleTimeString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canManage && n.provider === 'hetzner' ? (
                      <div className="flex justify-end gap-2">
                        {n.status === 'ready' ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              if (confirm(`Drain ${n.name}?`)) drain.mutate(n.id);
                            }}
                          >
                            Drain
                          </Button>
                        ) : null}
                        <Button
                          variant="danger"
                          onClick={() => {
                            if (confirm(`Delete ${n.name}? This will terminate the Hetzner VM.`)) {
                              del.mutate({ nodeId: n.id, force: true });
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
                  No nodes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function statusColor(s: string) {
  switch (s) {
    case 'ready':
      return 'text-green-400';
    case 'provisioning':
      return 'text-yellow-400';
    case 'draining':
      return 'text-orange-400';
    case 'terminated':
      return 'text-red-400';
    default:
      return 'text-[var(--color-muted)]';
  }
}

function capacity(n: NodeSummary, kind: 'cpu' | 'mem' | 'disk') {
  if (kind === 'cpu') {
    return `${n.used_cpu_millis}m / ${n.total_cpu_millis}m`;
  }
  if (kind === 'mem') {
    return `${n.used_memory_mb}MB / ${n.total_memory_mb}MB`;
  }
  return `${n.used_disk_mb}MB / ${n.total_disk_mb}MB`;
}
