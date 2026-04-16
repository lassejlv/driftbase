import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { CredentialKind, CredentialSummary } from './types';

export function credentialsQuery(slug: string) {
  return queryOptions({
    queryKey: ['workspace', slug, 'credentials'] as const,
    queryFn: ({ signal }) =>
      api<CredentialSummary[]>(`/workspaces/${encodeURIComponent(slug)}/credentials`, { signal }),
  });
}

export function useCredentials(slug: string) {
  return useQuery(credentialsQuery(slug));
}

export function useCreateCredential(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      kind: CredentialKind;
      name: string;
      secret: string;
      metadata?: Record<string, unknown>;
    }) =>
      api<CredentialSummary>(`/workspaces/${encodeURIComponent(slug)}/credentials`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', slug, 'credentials'] });
    },
  });
}

export function useRotateCredential(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; secret: string; metadata?: Record<string, unknown> }) =>
      api<CredentialSummary>(
        `/workspaces/${encodeURIComponent(slug)}/credentials/${encodeURIComponent(input.id)}`,
        { method: 'POST', body: { secret: input.secret, metadata: input.metadata } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', slug, 'credentials'] });
    },
  });
}

export function useDeleteCredential(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(
        `/workspaces/${encodeURIComponent(slug)}/credentials/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', slug, 'credentials'] });
    },
  });
}
