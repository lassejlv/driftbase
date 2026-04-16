import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  credentialsQuery,
  useCreateCredential,
  useDeleteCredential,
} from '@/lib/credentials';
import { workspaceQuery } from '@/lib/workspaces';
import { ApiError } from '@/lib/api';
import type { CredentialKind } from '@/lib/types';
import { Button, Card, ErrorText, Field, Input, Select } from '@/components/ui';

export const Route = createFileRoute('/w/$workspaceSlug/credentials')({
  component: CredentialsPage,
});

const KIND_LABEL: Record<CredentialKind, string> = {
  hetzner_api_token: 'Hetzner API token',
  github_pat: 'GitHub PAT',
  registry: 'Registry',
};

function CredentialsPage() {
  const { workspaceSlug } = Route.useParams();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const creds = useQuery(credentialsQuery(workspaceSlug));
  const create = useCreateCredential(workspaceSlug);
  const del = useDeleteCredential(workspaceSlug);

  const canManage = workspace.data
    ? workspace.data.role === 'owner' || workspace.data.role === 'admin'
    : false;

  const [kind, setKind] = useState<CredentialKind>('hetzner_api_token');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ kind, name, secret });
      setName('');
      setSecret('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  if (!canManage) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[var(--color-muted)]">
          You need admin or owner role to view credentials.
        </p>
      </Card>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Credentials</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Encrypted at rest. Secrets are never shown again after creation.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-medium">Add credential</h2>
        <form
          onSubmit={onSubmit}
          className="grid grid-cols-[180px_1fr_1fr_auto] items-end gap-3"
        >
          <Field label="Kind" htmlFor="cred-kind">
            <Select
              id="cred-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as CredentialKind)}
            >
              <option value="hetzner_api_token">Hetzner API token</option>
              <option value="github_pat">GitHub PAT</option>
              <option value="registry">Registry</option>
            </Select>
          </Field>
          <Field label="Name" htmlFor="cred-name">
            <Input
              id="cred-name"
              required
              placeholder="production"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Secret" htmlFor="cred-secret">
            <Input
              id="cred-secret"
              type="password"
              required
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
        {error ? (
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {creds.data?.length ? (
              creds.data.map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2 font-mono text-xs">{KIND_LABEL[c.kind]}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (confirm(`Delete ${c.name}?`)) del.mutate(c.id);
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
                  No credentials yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
