import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { NodeSummary } from './types';

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  is_platform_admin: boolean;
  created_at: string;
}

export interface AdminCounts {
  users: number;
  workspaces: number;
  projects: number;
  services: number;
  deployments: number;
  running_deployments: number;
  nodes: number;
  ready_nodes: number;
  errored_deployments: number;
}

export interface AdminDeployment {
  id: string;
  workspace_slug: string;
  project_slug: string;
  service_slug: string;
  status: string;
  image_ref: string;
  reason: string | null;
  node_id: string | null;
  updated_at: string;
  created_at: string;
}

export interface AdminOverview {
  counts: AdminCounts;
  pending_users: number;
  unhealthy_deployments: AdminDeployment[];
}

export interface AdminNode extends NodeSummary {
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  hetzner_location: string | null;
  hetzner_server_type: string | null;
}

export interface AgentUpdateResponse {
  status: string;
  update_available: boolean;
  target_image_ref: string | null;
  target_digest: string | null;
  error: string | null;
  command_id: string | null;
}

export interface AdminEdgeOverview {
  edge_hostname: string;
  edge_ips: string[];
  route_count: number;
  regions: AdminEdgeRegion[];
}

export interface AdminEdgeRegion {
  id: string;
  name: string;
  provider: string;
  location: string;
  server_type: string;
  desired_nodes: number;
  status: string;
  created_at: string;
  nodes: AdminEdgeNode[];
}

export interface AdminEdgeNode {
  id: string;
  region_id: string;
  name: string;
  provider: string;
  status: string;
  public_ipv4: string | null;
  hetzner_location: string | null;
  hetzner_server_type: string | null;
  wireguard_mesh_ip: string | null;
  agent_version: string | null;
  route_count: number;
  caddy_synced_at: string | null;
  caddy_sync_error: string | null;
  private_network_synced_at: string | null;
  private_network_sync_error: string | null;
  last_error: string | null;
  last_seen_at: string | null;
  registered_at: string | null;
  created_at: string;
}

export const adminOverviewQuery = queryOptions({
  queryKey: ['admin', 'overview'] as const,
  queryFn: ({ signal }) => api<AdminOverview>('/admin/overview', { signal }),
});

export const adminNodesQuery = queryOptions({
  queryKey: ['admin', 'nodes'] as const,
  queryFn: ({ signal }) => api<AdminNode[]>('/admin/nodes', { signal }),
});

export const adminUsersQuery = queryOptions({
  queryKey: ['admin', 'users'] as const,
  queryFn: ({ signal }) => api<AdminUser[]>('/admin/users', { signal }),
});

export const adminEdgeQuery = queryOptions({
  queryKey: ['admin', 'edge'] as const,
  queryFn: ({ signal }) => api<AdminEdgeOverview>('/admin/edge/regions', { signal }),
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

export function useAdminDrainNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/nodes/${encodeURIComponent(id)}/drain`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'nodes'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminCheckAgentUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<AgentUpdateResponse>(`/admin/nodes/${encodeURIComponent(id)}/agent-update/check`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'nodes'] });
    },
  });
}

export function useAdminUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<AgentUpdateResponse>(`/admin/nodes/${encodeURIComponent(id)}/agent-update`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'nodes'] });
    },
  });
}

export function useAdminDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api<void>(
        `/admin/nodes/${encodeURIComponent(id)}${force ? '?force=true' : ''}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'nodes'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminCreateEdgeRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; location: string; server_type?: string }) =>
      api<{ region_id: string; edge_node_id: string; hetzner_server_id: number }>(
        '/admin/edge/regions',
        { method: 'POST', body: input },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'edge'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminDisableEdgeRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/edge/regions/${encodeURIComponent(id)}/disable`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'edge'] });
    },
  });
}

export function useAdminDrainEdgeNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/edge/nodes/${encodeURIComponent(id)}/drain`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'edge'] });
    },
  });
}

export function useAdminDeleteEdgeNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/edge/nodes/${encodeURIComponent(id)}?force=true`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'edge'] });
    },
  });
}
