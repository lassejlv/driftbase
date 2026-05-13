import { useEffect, useState } from 'react';
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  KeyRound,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from 'lucide-react';
import { meQuery } from '@/lib/auth';
import { useWorkspaces, workspaceQuery } from '@/lib/workspaces';

export const Route = createFileRoute('/w/$workspaceSlug')({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    await context.queryClient.ensureQueryData(workspaceQuery(params.workspaceSlug));
  },
  component: WorkspaceLayout,
});

const SIDEBAR_COLLAPSE_KEY = 'driftbase:sidebar-collapsed';

function WorkspaceLayout() {
  const { workspaceSlug } = Route.useParams();
  const workspaces = useWorkspaces();
  const current = workspaces.data?.find((w) => w.slug === workspaceSlug);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Project detail pages have their own sidebar; don't nest ours inside.
  const inProjectDetail = new RegExp(
    `^/w/${escapeRegex(workspaceSlug)}/projects/[^/]+`,
  ).test(location.pathname);
  if (inProjectDetail) {
    return <Outlet />;
  }

  return (
    <div
      className="grid gap-10 transition-[grid-template-columns] duration-200"
      style={{
        gridTemplateColumns: collapsed ? '56px 1fr' : '220px 1fr',
      }}
    >
      <aside className="sticky top-16 self-start">
        {collapsed ? (
          <div className="mb-6 flex justify-center">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              {workspaceSlug.slice(0, 2)}
            </div>
          </div>
        ) : (
          <WorkspaceSwitcher
            workspaceSlug={workspaceSlug}
            workspaces={workspaces.data ?? []}
            role={current?.role}
          />
        )}
        <nav
          className={[
            'flex flex-col gap-6 text-sm',
            collapsed ? 'mt-2 items-center' : 'mt-6',
          ].join(' ')}
        >
          <NavGroup>
            <SidebarLink
              to="/w/$workspaceSlug"
              params={{ workspaceSlug }}
              label="Overview"
              icon={LayoutDashboard}
              exact
              collapsed={collapsed}
            />
          </NavGroup>
          <NavGroup>
            <SidebarLink
              to="/w/$workspaceSlug/projects"
              params={{ workspaceSlug }}
              label="Projects"
              icon={FolderKanban}
              collapsed={collapsed}
            />
          </NavGroup>
          <NavGroup>
            <SidebarLink
              to="/w/$workspaceSlug/members"
              params={{ workspaceSlug }}
              label="Members"
              icon={Users}
              collapsed={collapsed}
            />
            <SidebarLink
              to="/w/$workspaceSlug/credentials"
              params={{ workspaceSlug }}
              label="Credentials"
              icon={KeyRound}
              collapsed={collapsed}
            />
          </NavGroup>
          <NavGroup>
            <SidebarLink
              to="/w/$workspaceSlug/settings"
              params={{ workspaceSlug }}
              label="Settings"
              icon={SettingsIcon}
              collapsed={collapsed}
            />
          </NavGroup>
        </nav>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={[
            'mt-8 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]',
            'text-[var(--color-muted)] hover:text-[var(--color-fg)]',
            collapsed ? 'justify-center' : '',
          ].join(' ')}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <>
              <ChevronsLeft className="h-3.5 w-3.5" />
              <span>hide</span>
            </>
          )}
        </button>
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

function NavGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5">{children}</div>;
}

function WorkspaceSwitcher({
  workspaceSlug,
  workspaces,
  role,
}: {
  workspaceSlug: string;
  workspaces: { slug: string; name: string }[];
  role?: string;
}) {
  return (
    <div className="relative">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted)]">
        Workspace
      </div>
      <div className="relative mt-1">
        <select
          className="w-full appearance-none rounded-md border border-transparent bg-transparent py-1.5 pr-7 text-sm font-medium hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none"
          value={workspaceSlug}
          onChange={(e) => {
            window.location.href = `/w/${e.target.value}`;
          }}
        >
          {workspaces.map((w) => (
            <option key={w.slug} value={w.slug}>
              {w.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
      </div>
      {role ? (
        <div className="mt-0.5 font-mono text-[11px] text-[var(--color-muted)]">
          {role} · {workspaceSlug}
        </div>
      ) : null}
    </div>
  );
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function SidebarLink({
  to,
  params,
  label,
  icon: Icon,
  exact,
  collapsed,
}: {
  to:
    | '/w/$workspaceSlug'
    | '/w/$workspaceSlug/projects'
    | '/w/$workspaceSlug/members'
    | '/w/$workspaceSlug/credentials'
    | '/w/$workspaceSlug/settings';
  params: { workspaceSlug: string };
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  collapsed?: boolean;
}) {
  const base = collapsed
    ? 'group flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]'
    : 'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]';
  const activeBase = collapsed
    ? 'flex h-9 w-9 items-center justify-center rounded-md bg-black/5 text-[var(--color-fg)] dark:bg-white/5'
    : 'flex items-center gap-2.5 rounded-md bg-black/5 px-2 py-1.5 text-[var(--color-fg)] dark:bg-white/5';
  return (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact }}
      title={collapsed ? label : undefined}
      className={base}
      activeProps={{ className: activeBase }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );
}
