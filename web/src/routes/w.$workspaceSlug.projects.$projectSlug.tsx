import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { NewServiceSheet } from '@/components/new-service-sheet';
import { Button } from '@/components/ui';
import { projectQuery } from '@/lib/projects';
import { servicesQuery } from '@/lib/services';
import { workspaceQuery } from '@/lib/workspaces';

export const Route = createFileRoute('/w/$workspaceSlug/projects/$projectSlug')({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { workspaceSlug, projectSlug } = Route.useParams();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const project = useQuery(projectQuery(workspaceSlug, projectSlug));
  const services = useQuery(servicesQuery(workspaceSlug, projectSlug));

  const canCreate = workspace.data ? workspace.data.role !== 'viewer' : false;

  return (
    <div className="grid grid-cols-[200px_1fr] gap-6">
      <aside className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <Link
              to="/w/$workspaceSlug/projects"
              params={{ workspaceSlug }}
              className="hover:underline"
            >
              Projects
            </Link>{' '}
            /
          </div>
          <Link
            to="/w/$workspaceSlug/projects/$projectSlug"
            params={{ workspaceSlug, projectSlug }}
            className="mt-0.5 block text-sm font-medium"
          >
            {project.data?.name ?? projectSlug}
          </Link>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
              Services
            </div>
            {canCreate ? (
              <NewServiceSheet workspaceSlug={workspaceSlug} projectSlug={projectSlug}>
                <Button variant="ghost" className="h-6 w-6 px-0">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </NewServiceSheet>
            ) : null}
          </div>

          <nav className="flex flex-col gap-0.5 text-sm">
            {services.data?.length ? (
              services.data.map((s) => (
                <Link
                  key={s.id}
                  to="/w/$workspaceSlug/projects/$projectSlug/$serviceSlug"
                  params={{ workspaceSlug, projectSlug, serviceSlug: s.slug }}
                  className="rounded-md px-2 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                  activeProps={{
                    className:
                      'rounded-md bg-black/5 px-2 py-1.5 text-[var(--color-fg)] dark:bg-white/5',
                  }}
                >
                  <div>{s.name}</div>
                  <div className="font-mono text-[10px] text-[var(--color-muted)]">
                    {s.slug}
                  </div>
                </Link>
              ))
            ) : (
              <p className="px-2 py-1 text-xs text-[var(--color-muted)]">No services yet.</p>
            )}
          </nav>
        </div>
      </aside>

      <div>
        <Outlet />
      </div>
    </div>
  );
}
