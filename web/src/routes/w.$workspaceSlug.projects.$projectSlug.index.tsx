import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectQuery } from '@/lib/projects';
import { ProjectCanvas } from '@/components/board/canvas/project-canvas';
import type { RouteStaticData } from '@/routes/__root';
import type { InspectorTab } from '@/components/service/service-inspector';

const TAB_VALUES: InspectorTab[] = [
  'deployments',
  'metrics',
  'builds',
  'domains',
  'volume',
  'logs',
  'variables',
  'settings',
];

export interface ProjectCanvasSearch {
  service?: string;
  tab?: InspectorTab;
}

export const Route = createFileRoute('/w/$workspaceSlug/projects/$projectSlug/')({
  component: ProjectBoard,
  staticData: { fullBleed: true } satisfies RouteStaticData,
  validateSearch: (raw: Record<string, unknown>): ProjectCanvasSearch => ({
    service: typeof raw.service === 'string' && raw.service.length > 0 ? raw.service : undefined,
    tab:
      typeof raw.tab === 'string' && (TAB_VALUES as string[]).includes(raw.tab)
        ? (raw.tab as InspectorTab)
        : undefined,
  }),
});

function ProjectBoard() {
  const { workspaceSlug, projectSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const project = useQuery(projectQuery(workspaceSlug, projectSlug));

  if (!project.data) {
    return <div className="h-full w-full" />;
  }

  return (
    <ProjectCanvas
      workspaceSlug={workspaceSlug}
      projectSlug={projectSlug}
      project={project.data}
      selectedServiceId={search.service ?? null}
      activeTab={search.tab}
      onSelectService={(id) =>
        navigate({
          to: '.',
          search: (s: ProjectCanvasSearch) => ({
            ...s,
            service: id ?? undefined,
            // Clearing the service clears the tab too — no point keeping a
            // stale tab while the drawer is closed.
            tab: id ? s.tab : undefined,
          }),
          replace: true,
        })
      }
      onChangeTab={(tab) =>
        navigate({
          to: '.',
          search: (s: ProjectCanvasSearch) => ({ ...s, tab }),
          replace: true,
        })
      }
    />
  );
}
