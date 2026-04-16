import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { sshKeysQuery, useCreateSshKey, useDeleteSshKey } from '@/lib/ssh-keys';
import { workspaceQuery } from '@/lib/workspaces';
import { ApiError } from '@/lib/api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

export const Route = createFileRoute('/w/$workspaceSlug/ssh-keys')({
  component: SshKeysPage,
});

function SshKeysPage() {
  const { workspaceSlug } = Route.useParams();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const keys = useQuery(sshKeysQuery(workspaceSlug));
  const create = useCreateSshKey(workspaceSlug);
  const del = useDeleteSshKey(workspaceSlug);

  const canManage = workspace.data
    ? workspace.data.role === 'owner' || workspace.data.role === 'admin'
    : false;

  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        name,
        public_key: publicKey,
        private_key: privateKey.trim() ? privateKey : undefined,
      });
      setName('');
      setPublicKey('');
      setPrivateKey('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  if (!canManage) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[var(--color-muted)]">
          You need admin or owner role to view SSH keys.
        </p>
      </Card>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">SSH keys</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Public keys are uploaded to Hetzner when provisioning. Private keys (optional) are
          encrypted at rest.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-medium">Add SSH key</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Name" htmlFor="key-name">
            <Input
              id="key-name"
              required
              placeholder="deploy-key"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Public key"
            htmlFor="key-public"
            hint="OpenSSH format, e.g. ssh-ed25519 AAAA… comment"
          >
            <textarea
              id="key-public"
              required
              rows={3}
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent p-2 font-mono text-xs focus:border-[var(--color-accent)] focus:outline-none"
            />
          </Field>
          <Field
            label="Private key (optional)"
            htmlFor="key-private"
            hint="PEM format. Stored encrypted and never shown back."
          >
            <textarea
              id="key-private"
              rows={4}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent p-2 font-mono text-xs focus:border-[var(--color-accent)] focus:outline-none"
            />
          </Field>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save key'}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Fingerprint</th>
              <th className="px-4 py-2 font-medium">Private</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {keys.data?.length ? (
              keys.data.map((k) => (
                <tr key={k.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2">{k.name}</td>
                  <td className="px-4 py-2 font-mono text-xs break-all">{k.fingerprint}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">
                    {k.has_private_key ? 'stored' : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (confirm(`Delete ${k.name}?`)) del.mutate(k.id);
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
                  No SSH keys yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
