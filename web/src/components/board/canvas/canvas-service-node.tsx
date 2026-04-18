import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { DeploymentSummary, ServiceSummary } from '@/lib/types';
import { deploymentTone } from '@/lib/deployments';
import { NODE_WIDTH } from '@/lib/canvas-layout';
import { spring } from '@/lib/motion-presets';
import { kindFor, ServiceLogo } from './service-logo';

export interface CanvasServiceNodeState {
  service: ServiceSummary;
  latestDeployment?: DeploymentSummary;
}

const STATUS_LABEL: Record<NonNullable<DeploymentSummary['status']> | 'none', string> = {
  pending: 'Pending',
  building: 'Building',
  placing: 'Placing',
  pulling: 'Pulling',
  starting: 'Starting',
  running: 'Online',
  failing: 'Failing',
  stopped: 'Stopped',
  errored: 'Errored',
  none: 'Never deployed',
};

const TONE_TEXT = {
  ok: 'text-emerald-400',
  info: 'text-indigo-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  muted: 'text-[var(--color-muted)]',
  accent: 'text-emerald-400',
} as const;

const TONE_DOT = {
  ok: 'bg-emerald-400 shadow-[0_0_0_2px_color-mix(in_oklch,theme(colors.emerald.400)_20%,transparent)]',
  info: 'bg-indigo-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
  muted: 'bg-[var(--color-subtle)]',
  accent: 'bg-emerald-400',
} as const;

interface Props {
  state: CanvasServiceNodeState;
  x: number;
  y: number;
  zoom: number;
  selected: boolean;
  onSelect: (serviceId: string) => void;
  onDrag: (serviceId: string, x: number, y: number) => void;
  onDragCommit: () => void;
}

export function CanvasServiceNode({
  state,
  x,
  y,
  zoom,
  selected,
  onSelect,
  onDrag,
  onDragCommit,
}: Props) {
  const { service, latestDeployment } = state;
  const kind = kindFor(service);
  const { tone, pulse } = deploymentTone(latestDeployment?.status);
  const label = STATUS_LABEL[latestDeployment?.status ?? 'none'];
  const shouldReduce = useReducedMotion();

  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const node = e.currentTarget;
    node.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = x;
    const origY = y;
    movedRef.current = false;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / (zoom || 1);
      const dy = (ev.clientY - startY) / (zoom || 1);
      if (!movedRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        movedRef.current = true;
        setDragging(true);
      }
      if (movedRef.current) onDrag(service.id, origX + dx, origY + dy);
    };

    const onUp = () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
      if (movedRef.current) {
        onDragCommit();
        setDragging(false);
      } else {
        onSelect(service.id);
      }
    };

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
  };

  const baseShadow = '0 1px 2px rgba(0,0,0,0.25)';
  const dragShadow = '0 12px 28px rgba(0,0,0,0.35)';

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(service.id);
        }
      }}
      whileHover={shouldReduce || dragging ? undefined : { y: -1 }}
      animate={{
        scale: shouldReduce ? 1 : selected ? 1.02 : 1,
        opacity: dragging ? 0.92 : 1,
        boxShadow: dragging ? dragShadow : baseShadow,
      }}
      transition={shouldReduce ? { duration: 0 } : spring.snappy}
      className={[
        'absolute select-none overflow-hidden rounded-[10px] border bg-[var(--color-surface)]',
        'transition-colors duration-150',
        'cursor-grab active:cursor-grabbing',
        selected
          ? 'border-[var(--color-border-strong)] ring-1 ring-[var(--color-border-strong)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
      ].join(' ')}
      style={{ left: x, top: y, width: NODE_WIDTH }}
      data-service-id={service.id}
    >
      <div className="flex items-center gap-[10px] px-[14px] pt-[14px]">
        <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <ServiceLogo kind={kind} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-fg)] tracking-[-0.005em]">
          {service.name}
        </span>
      </div>

      <div
        className={[
          'flex items-center gap-[10px] px-[14px] pt-2 pb-[14px] text-[12px]',
          TONE_TEXT[tone],
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-[6px] w-[6px] rounded-full',
            TONE_DOT[tone],
            pulse ? 'animate-status-pulse' : '',
          ].join(' ')}
        />
        <span>{label}</span>
      </div>
    </motion.div>
  );
}
