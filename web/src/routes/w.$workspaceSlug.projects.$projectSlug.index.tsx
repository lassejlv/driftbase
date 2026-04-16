import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { NewServiceSheet } from '@/components/new-service-sheet';
import { Button, Card } from '@/components/ui';
import { projectQuery } from '@/lib/projects';
import { servicesQuery } from '@/lib/services';
import { workspaceQuery } from '@/lib/workspaces';

export const Route = createFileRoute('/w/$workspaceSlug/projects/$projectSlug/')({
  component: ProjectOverview,
});

function ProjectOverview() {
  const { workspaceSlug, projectSlug } = Route.useParams();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const project = useQuery(projectQuery(workspaceSlug, projectSlug));
  const services = useQuery(servicesQuery(workspaceSlug, projectSlug));

  const canCreate = workspace.data ? workspace.data.role !== 'viewer' : false;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {project.data?.name ?? projectSlug}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          <span className="font-mono">{projectSlug}</span> · {services.data?.length ?? 0}{' '}
          service{services.data?.length === 1 ? '' : 's'}
        </p>
      </div>

      {services.data && services.data.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <div>
            <h2 className="text-sm font-medium">No services yet</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Services are containers managed by Zediz. Add one to get started.
            </p>
          </div>
          {canCreate ? (
            <NewServiceSheet workspaceSlug={workspaceSlug} projectSlug={projectSlug}>
              <Button>Create service</Button>
            </NewServiceSheet>
          ) : null}
        </Card>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-[var(--color-muted)]">
            Pick a service from the sidebar to view deployments and logs.
          </p>
        </Card>
      )}
    </section>
  );
}
