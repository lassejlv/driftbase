import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { workspaceQuery } from '@/lib/workspaces';
import { projectsQuery } from '@/lib/projects';
import { nodesQuery } from '@/lib/nodes';
import { Card } from '@/components/ui';

export const Route = createFileRoute('/w/$workspaceSlug/')({
  component: OverviewPage,
});

function OverviewPage() {
  const { workspaceSlug } = Route.useParams();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const projects = useQuery(projectsQuery(workspaceSlug));
  const nodes = useQuery(nodesQuery(workspaceSlug));

  const projectCount = projects.data?.length ?? 0;
  const nodeCount = nodes.data?.length ?? 0;
  const readyNodes = nodes.data?.filter((n) => n.status === 'ready').length ?? 0;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {workspace.data?.name ?? workspaceSlug}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Your role: {workspace.data?.role ?? '—'}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Projects', value: String(projectCount) },
          { label: 'Nodes', value: String(nodeCount) },
          { label: 'Ready nodes', value: String(readyNodes) },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
              {c.label}
            </div>
            <div className="mt-2 font-mono text-2xl">{c.value}</div>
          </Card>
        ))}
      </div>
    </section>
  );
}
