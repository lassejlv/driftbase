import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  projectsQuery,
  useCreateProject,
  useDeleteProject,
} from '@/lib/projects';
import { workspaceQuery } from '@/lib/workspaces';
import { ApiError } from '@/lib/api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

export const Route = createFileRoute('/w/$workspaceSlug/projects/')({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { workspaceSlug } = Route.useParams();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const projects = useQuery(projectsQuery(workspaceSlug));
  const create = useCreateProject(workspaceSlug);
  const del = useDeleteProject(workspaceSlug);

  const canCreate = workspace.data
    ? workspace.data.role !== 'viewer'
    : false;
  const canDelete = workspace.data
    ? workspace.data.role === 'owner' || workspace.data.role === 'admin'
    : false;

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ slug, name });
      setSlug('');
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Projects group services together inside a workspace.
        </p>
      </div>

      {canCreate ? (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-medium">New project</h2>
          <form
            onSubmit={onSubmit}
            className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
          >
            <Field label="Slug" htmlFor="proj-slug" hint="lowercase, dashes allowed">
              <Input
                id="proj-slug"
                required
                placeholder="api"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </Field>
            <Field label="Name" htmlFor="proj-name">
              <Input
                id="proj-name"
                required
                placeholder="Public API"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </form>
          {error ? (
            <div className="mt-3">
              <ErrorText>{error}</ErrorText>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Slug</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {projects.data?.length ? (
              projects.data.map((p) => (
                <tr key={p.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2">
                    <Link
                      to="/w/$workspaceSlug/projects/$projectSlug"
                      params={{ workspaceSlug, projectSlug: p.slug }}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{p.slug}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canDelete ? (
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (confirm(`Delete project ${p.slug}?`)) del.mutate(p.slug);
                        }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
