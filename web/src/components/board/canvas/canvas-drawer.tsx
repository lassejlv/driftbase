import { Link } from '@tanstack/react-router';
import { ExternalLink, X } from 'lucide-react';
import type { ServiceSummary } from '@/lib/types';
import {
  ServiceInspector,
  type InspectorTab,
} from '@/components/service/service-inspector';
import { kindFor, ServiceLogo } from './service-logo';

interface Props {
  workspaceSlug: string;
  projectSlug: string;
  service: ServiceSummary;
  activeTab?: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  onClose: () => void;
}

export function CanvasDrawer({
  workspaceSlug,
  projectSlug,
  service,
  activeTab,
  onChangeTab,
  onClose,
}: Props) {
  const kind = kindFor(service);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-3">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center">
          <ServiceLogo kind={kind} size={22} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">
          {service.name}
        </span>
        <Link
          to="/w/$workspaceSlug/projects/$projectSlug/$serviceSlug"
          params={{ workspaceSlug, projectSlug, serviceSlug: service.slug }}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--color-fg)] dark:hover:bg-white/5"
          title="Open full service page"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--color-fg)] dark:hover:bg-white/5"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <ServiceInspector
          workspaceSlug={workspaceSlug}
          projectSlug={projectSlug}
          serviceSlug={service.slug}
          variant="drawer"
          tab={activeTab}
          onTabChange={onChangeTab}
          onDeleted={onClose}
        />
      </div>
    </div>
  );
}
