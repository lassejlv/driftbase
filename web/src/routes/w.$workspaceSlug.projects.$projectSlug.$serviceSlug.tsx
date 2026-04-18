import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui';
import { serviceQuery } from '@/lib/services';
import { ServiceInspector } from '@/components/service/service-inspector';

export const Route = createFileRoute(
  '/w/$workspaceSlug/projects/$projectSlug/$serviceSlug',
)({
  component: ServicePage,
});

function ServicePage() {
  const { workspaceSlug, projectSlug, serviceSlug } = Route.useParams();
  const service = useQuery(serviceQuery(workspaceSlug, projectSlug, serviceSlug));
  const svc = service.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', to: `/w/${workspaceSlug}/projects` },
          { label: projectSlug, to: `/w/${workspaceSlug}/projects/${projectSlug}` },
          { label: serviceSlug },
        ]}
        title={svc?.name ?? serviceSlug}
      />
      <ServiceInspector
        workspaceSlug={workspaceSlug}
        projectSlug={projectSlug}
        serviceSlug={serviceSlug}
        variant="page"
      />
    </div>
  );
}
