import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { motion, useReducedMotion } from 'motion/react';
import { Search } from 'lucide-react';
import { popIn } from '@/lib/motion-presets';
import { ServiceLogo, type ServiceKind } from './service-logo';

interface Props {
  workspaceSlug: string;
  projectSlug: string;
  onClose: () => void;
}

type Target =
  | { type: 'template'; templateId: string }
  | { type: 'blank' };

interface Option {
  key: string;
  label: string;
  kind: ServiceKind;
  sub?: string;
  section: 'Databases' | 'Apps';
  target: Target;
}

const OPTIONS: Option[] = [
  {
    key: 'postgres',
    label: 'Postgres',
    kind: 'postgres',
    sub: '16',
    section: 'Databases',
    target: { type: 'template', templateId: 'postgres' },
  },
  {
    key: 'valkey',
    label: 'Valkey',
    kind: 'valkey',
    sub: '7',
    section: 'Databases',
    target: { type: 'template', templateId: 'redis' },
  },
  {
    key: 'blank',
    label: 'Empty service',
    kind: 'web',
    section: 'Apps',
    target: { type: 'blank' },
  },
  {
    key: 'worker',
    label: 'Worker',
    kind: 'worker',
    section: 'Apps',
    target: { type: 'blank' },
  },
  {
    key: 'github',
    label: 'From GitHub',
    kind: 'fileserver',
    section: 'Apps',
    target: { type: 'blank' },
  },
];

export function AddServicePopover({ workspaceSlug, projectSlug, onClose }: Props) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const sections: Option['section'][] = ['Databases', 'Apps'];

  const pick = (o: Option) => {
    onClose();
    if (o.target.type === 'template') {
      navigate({
        to: '/w/$workspaceSlug/projects/$projectSlug/templates/$templateId',
        params: { workspaceSlug, projectSlug, templateId: o.target.templateId },
      });
    } else {
      navigate({
        to: '/w/$workspaceSlug/projects/$projectSlug/new',
        params: { workspaceSlug, projectSlug },
      });
    }
  };

  return (
    <motion.div
      variants={popIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={shouldReduce ? { duration: 0 } : { duration: 0.14 }}
      className="pointer-events-auto absolute right-4 top-[60px] z-30 w-[300px] rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
      style={{ transformOrigin: 'top right' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="-m-1 mb-0 flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
        <Search className="h-3.5 w-3.5" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates..."
          className="flex-1 border-none bg-transparent text-[13px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-muted)]"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && filtered[0]) pick(filtered[0]);
          }}
        />
      </div>

      {sections.map((section) => {
        const items = filtered.filter((o) => o.section === section);
        if (items.length === 0) return null;
        return (
          <div key={section} className="pt-1">
            <div className="px-[10px] pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
              {section}
            </div>
            {items.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => pick(o)}
                className="flex w-full items-center gap-[10px] rounded-[5px] px-[10px] py-[7px] text-left text-[13px] text-[var(--color-fg)] transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                  <ServiceLogo kind={o.kind} />
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.sub ? (
                  <span className="ml-auto font-mono text-[11px] text-[var(--color-muted)]">
                    {o.sub}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        );
      })}

      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-[var(--color-muted)]">
          No templates match.
        </div>
      ) : null}
    </motion.div>
  );
}
