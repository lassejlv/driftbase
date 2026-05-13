import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Zap } from 'lucide-react';

/* ---------- command palette context ---------- */

interface PaletteCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const PaletteContext = createContext<PaletteCtx | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function useCommandPalette(): PaletteCtx {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used inside CommandPaletteProvider');
  return ctx;
}

/* ---------- activity strip context ----------
 *
 * Pages register a transient "happening now" item. The shell renders a slim
 * pulsing strip beneath the top bar whenever there is at least one. Items are
 * keyed so a page can update its own entry without stomping others.
 */

export interface ActivityItem {
  key: string;
  status: 'building' | 'deploying' | 'pending' | 'errored';
  title: ReactNode;
  detail?: ReactNode;
  to?: string;
}

interface ActivityCtx {
  items: ActivityItem[];
  set: (item: ActivityItem) => void;
  clear: (key: string) => void;
}

const ActivityContext = createContext<ActivityCtx | null>(null);

export function ActivityStripProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, ActivityItem>>({});

  const set = useCallback((item: ActivityItem) => {
    setItems((prev) => {
      const existing = prev[item.key];
      if (
        existing &&
        existing.status === item.status &&
        existing.title === item.title &&
        existing.detail === item.detail &&
        existing.to === item.to
      ) {
        return prev;
      }
      return { ...prev, [item.key]: item };
    });
  }, []);

  const clear = useCallback((key: string) => {
    setItems((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const value = useMemo(
    () => ({ items: Object.values(items), set, clear }),
    [items, set, clear],
  );
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivityStrip(): ActivityCtx {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivityStrip must be used inside ActivityStripProvider');
  return ctx;
}

/**
 * Convenience: register an activity item for the lifetime of the calling
 * component. When the component unmounts or `item` becomes null, the entry is
 * removed.
 */
export function useRegisterActivity(item: ActivityItem | null) {
  const { set, clear } = useActivityStrip();
  useEffect(() => {
    if (!item) return;
    set(item);
    return () => clear(item.key);
  }, [item, set, clear]);
}

/* ---------- activity strip view ---------- */

const statusColor: Record<ActivityItem['status'], string> = {
  building: 'text-amber-400',
  deploying: 'text-emerald-400',
  pending: 'text-indigo-400',
  errored: 'text-red-400',
};

export function ActivityStrip() {
  const { items } = useActivityStrip();
  const reduce = useReducedMotion();
  const item = items[0];

  return (
    <div className="sticky top-12 z-[9] overflow-hidden">
      <AnimatePresence initial={false}>
        {item ? (
          <motion.div
            key={item.key + item.status}
            initial={reduce ? { opacity: 0 } : { y: -16, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: -16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/85 backdrop-blur"
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-1.5 text-xs">
              <div className="flex items-center gap-2 truncate">
                <Zap
                  className={[
                    'h-3.5 w-3.5 shrink-0 animate-status-pulse',
                    statusColor[item.status],
                  ].join(' ')}
                />
                <span className="truncate font-medium text-[var(--color-fg)]">{item.title}</span>
                {item.detail ? (
                  <span className="truncate text-[var(--color-muted)]">· {item.detail}</span>
                ) : null}
                {items.length > 1 ? (
                  <span className="shrink-0 rounded-full bg-[var(--color-border)] px-1.5 py-px text-[10px] text-[var(--color-muted)]">
                    +{items.length - 1}
                  </span>
                ) : null}
              </div>
              {item.to ? (
                <a
                  href={item.to}
                  className="shrink-0 text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                >
                  view →
                </a>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ---------- ⌘K trigger button ---------- */

export function CommandKTrigger() {
  const { toggle } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Open command palette"
      className={[
        'inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)]',
        'px-1.5 py-1 text-[11px] text-[var(--color-muted)]',
        'hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
        'transition-colors',
      ].join(' ')}
    >
      <span className="font-mono">⌘K</span>
    </button>
  );
}
