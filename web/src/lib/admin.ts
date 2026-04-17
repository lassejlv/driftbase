import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  is_platform_admin: boolean;
  created_at: string;
}

export const adminUsersQuery = queryOptions({
  queryKey: ['admin', 'users'] as const,
  queryFn: ({ signal }) => api<AdminUser[]>('/admin/users', { signal }),
});

export function useApproveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/users/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useRejectUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/users/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
