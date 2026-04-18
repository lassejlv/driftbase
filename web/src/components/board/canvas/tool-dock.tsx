import { Maximize2, Minus, Plus, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { spring } from '@/lib/motion-presets';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onOpenSettings?: () => void;
}

export function ToolDock({ onZoomIn, onZoomOut, onFit, onOpenSettings }: Props) {
  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-4 z-[5] flex flex-col rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Tool title="Zoom in" onClick={onZoomIn}>
        <Plus className="h-3.5 w-3.5" />
      </Tool>
      <Tool title="Zoom out" onClick={onZoomOut}>
        <Minus className="h-3.5 w-3.5" />
      </Tool>
      <Tool title="Fit view" onClick={onFit}>
        <Maximize2 className="h-3.5 w-3.5" />
      </Tool>
      {onOpenSettings ? (
        <>
          <div className="mx-auto my-[3px] h-px w-5 bg-[var(--color-border)]" />
          <Tool title="Canvas settings" onClick={onOpenSettings}>
            <Settings2 className="h-3.5 w-3.5" />
          </Tool>
        </>
      ) : null}
    </div>
  );
}

function Tool({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      title={title}
      onClick={onClick}
      whileTap={shouldReduce ? undefined : { scale: 0.9 }}
      whileHover={shouldReduce ? undefined : { y: -0.5 }}
      transition={spring.snappy}
      className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--color-muted)] transition-colors hover:bg-black/5 hover:text-[var(--color-fg)] dark:hover:bg-white/5"
    >
      {children}
    </motion.button>
  );
}
