import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { meQuery } from '@/lib/auth';
import {
  adminUsersQuery,
  useApproveUser,
  useRejectUser,
  type AdminUser,
  type UserStatus,
} from '@/lib/admin';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  RelativeTime,
  Stack,
  StatusPill,
  type SemanticStatus,
} from '@/components/ui';

export const Route = createFileRoute('/admin/users')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    if (!me.is_platform_admin) throw redirect({ to: '/' });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminUsersQuery),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const users = useQuery({ ...adminUsersQuery, refetchInterval: 15_000 });
  const approve = useApproveUser();
  const reject = useRejectUser();

  const list = users.data ?? [];
  const pending = list.filter((u) => u.status === 'pending');
  const active = list.filter((u) => u.status !== 'pending');

  return (
    <Stack gap={6}>
      <PageHeader
        title="Users"
        subtitle={`${pending.length} pending · ${active.length} active`}
      />

      {pending.length === 0 && active.length === 0 ? (
        <EmptyState title="No users yet" body="New signups will show up here for approval." />
      ) : null}

      {pending.length > 0 ? (
        <Section title="Pending approval" count={pending.length}>
          <UserTable
            rows={pending}
            actions={(u) => (
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => approve.mutate(u.id)}
                  disabled={approve.isPending || reject.isPending}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  onClick={() => reject.mutate(u.id)}
                  disabled={approve.isPending || reject.isPending}
                >
                  Reject
                </Button>
              </div>
            )}
          />
        </Section>
      ) : null}

      {active.length > 0 ? (
        <Section title="All accounts" count={active.length}>
          <UserTable
            rows={active}
            actions={(u) =>
              u.status === 'rejected' ? (
                <div className="flex justify-end">
                  <Button onClick={() => approve.mutate(u.id)} disabled={approve.isPending}>
                    Restore
                  </Button>
                </div>
              ) : !u.is_platform_admin ? (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => reject.mutate(u.id)}
                    disabled={reject.isPending}
                  >
                    Revoke
                  </Button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <span className="text-xs text-[var(--color-muted)]">admin</span>
                </div>
              )
            }
          />
        </Section>
      ) : null}
    </Stack>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="text-xs text-[var(--color-muted)]">{count}</span>
      </div>
      <Card className="overflow-hidden">{children}</Card>
    </div>
  );
}

function UserTable({
  rows,
  actions,
}: {
  rows: AdminUser[];
  actions: (u: AdminUser) => React.ReactNode;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
        <tr>
          <th className="px-4 py-2 font-medium">User</th>
          <th className="px-4 py-2 font-medium">Status</th>
          <th className="px-4 py-2 font-medium">Signed up</th>
          <th className="px-4 py-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id} className="border-t border-[var(--color-border)]">
            <td className="px-4 py-3">
              <div className="truncate font-medium">{u.display_name}</div>
              <div className="truncate font-mono text-xs text-[var(--color-muted)]">{u.email}</div>
            </td>
            <td className="px-4 py-3">
              <StatusPill
                status={statusTone(u.status)}
                label={u.status}
                pulse={u.status === 'pending'}
              />
            </td>
            <td className="px-4 py-3 text-xs">
              <RelativeTime date={u.created_at} className="!text-[var(--color-fg)]" />
            </td>
            <td className="px-4 py-3">{actions(u)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function statusTone(s: UserStatus): SemanticStatus {
  switch (s) {
    case 'approved':
      return 'ok';
    case 'rejected':
      return 'error';
    case 'pending':
    default:
      return 'warn';
  }
}
