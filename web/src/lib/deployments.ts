import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { DeploymentSummary } from './types';

export function useStopDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<DeploymentSummary>(`/deployments/${encodeURIComponent(id)}/stop`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
}

export function useRestartDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<DeploymentSummary>(`/deployments/${encodeURIComponent(id)}/restart`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
}
