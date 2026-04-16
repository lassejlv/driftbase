import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { SshKeySummary } from './types';

export function sshKeysQuery(slug: string) {
  return queryOptions({
    queryKey: ['workspace', slug, 'ssh-keys'] as const,
    queryFn: ({ signal }) =>
      api<SshKeySummary[]>(`/workspaces/${encodeURIComponent(slug)}/ssh-keys`, { signal }),
  });
}

export function useSshKeys(slug: string) {
  return useQuery(sshKeysQuery(slug));
}

export function useCreateSshKey(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; public_key: string; private_key?: string }) =>
      api<SshKeySummary>(`/workspaces/${encodeURIComponent(slug)}/ssh-keys`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', slug, 'ssh-keys'] });
    },
  });
}

export function useDeleteSshKey(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(
        `/workspaces/${encodeURIComponent(slug)}/ssh-keys/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', slug, 'ssh-keys'] });
    },
  });
}
