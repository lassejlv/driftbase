import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Zediz</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Self-hosted PaaS on Hetzner. Phase 0 scaffold — nothing wired up yet.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Projects', value: '—' },
          { label: 'Services', value: '—' },
          { label: 'Nodes', value: '—' },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[var(--color-border)] p-4"
          >
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
              {c.label}
            </div>
            <div className="mt-2 font-mono text-2xl">{c.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
