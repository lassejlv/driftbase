import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';
import type {
  DeploymentSummary,
  ProjectSummary,
  ServiceSummary,
} from '@/lib/types';
import { serviceDeploymentsQuery, servicesQuery } from '@/lib/services';
import { canWrite, workspaceQuery } from '@/lib/workspaces';
import { Button, EmptyState } from '@/components/ui';
import {
  clampZoom,
  fitViewport,
  loadLayout,
  saveLayout,
  type Layout,
} from '@/lib/canvas-layout';
import { slideInRight, spring } from '@/lib/motion-presets';
import { CanvasServiceNode } from './canvas-service-node';
import { CanvasDrawer } from './canvas-drawer';
import { ToolDock } from './tool-dock';
import { AddServicePopover } from './add-service-popover';
import type { InspectorTab } from '@/components/service/service-inspector';

interface Props {
  workspaceSlug: string;
  projectSlug: string;
  project: ProjectSummary;
  selectedServiceId: string | null;
  activeTab?: InspectorTab;
  onSelectService: (id: string | null) => void;
  onChangeTab: (tab: InspectorTab) => void;
}

const DEFAULT_ZOOM = 1.0;
const MAX_FIT_ZOOM = 1.3;

export function ProjectCanvas({
  workspaceSlug,
  projectSlug,
  project,
  selectedServiceId,
  activeTab,
  onSelectService,
  onChangeTab,
}: Props) {
  const shouldReduce = useReducedMotion();
  const workspace = useQuery(workspaceQuery(workspaceSlug));
  const services = useQuery({
    ...servicesQuery(workspaceSlug, projectSlug),
    refetchInterval: 5_000,
  });
  const serviceList = services.data ?? [];

  const deploymentsResults = useQueries({
    queries: serviceList.map((s) => ({
      ...serviceDeploymentsQuery(workspaceSlug, projectSlug, s.slug),
      refetchInterval: 5_000,
    })),
  });
  const latestByServiceId = useMemo(() => {
    const m = new Map<string, DeploymentSummary | undefined>();
    serviceList.forEach((s, i) => {
      const list = deploymentsResults[i]?.data as DeploymentSummary[] | undefined;
      m.set(s.id, list?.[0]);
    });
    return m;
  }, [serviceList, deploymentsResults]);

  const selectedService = selectedServiceId
    ? serviceList.find((s) => s.id === selectedServiceId)
    : undefined;

  // Layout — load from localStorage (or derive a default flow).
  const [layout, setLayout] = useState<Layout>({});
  useEffect(() => {
    if (!services.data) return;
    setLayout((prev) => {
      // When the services list changes, rehydrate / merge / evict.
      const base = loadLayout(project.id, services.data);
      // Merge unsaved in-memory moves for services that still exist.
      for (const [id, pos] of Object.entries(prev)) {
        if (base[id]) base[id] = pos;
      }
      return base;
    });
  }, [services.data, project.id]);

  const updatePos = useCallback(
    (id: string, x: number, y: number) => {
      setLayout((l) => ({ ...l, [id]: { x, y } }));
    },
    [],
  );

  const persistLayout = useCallback(() => {
    saveLayout(project.id, layout);
  }, [project.id, layout]);

  // Viewport
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);

  const fit = useCallback(
    (map: Layout = layout) => {
      if (size.width === 0 || size.height === 0) return;
      const { zoom: z, pan: p } = fitViewport(map, size, MAX_FIT_ZOOM);
      setZoom(z);
      setPan(p);
    },
    [layout, size],
  );

  // Auto-fit on first meaningful measurement with a non-empty layout.
  const didAutoFit = useRef(false);
  useEffect(() => {
    if (didAutoFit.current) return;
    if (size.width === 0 || size.height === 0) return;
    if (Object.keys(layout).length === 0) return;
    fit(layout);
    didAutoFit.current = true;
  }, [size, layout, fit]);

  // Selection + popover
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addOpen) {
        setAddOpen(false);
        return;
      }
      if (selectedServiceId) {
        onSelectService(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen, selectedServiceId, onSelectService]);

  // Clear selection if the URL points at a service that no longer exists.
  useEffect(() => {
    if (!selectedServiceId) return;
    if (!services.data) return;
    if (!serviceList.some((s) => s.id === selectedServiceId)) {
      onSelectService(null);
    }
  }, [services.data, serviceList, selectedServiceId, onSelectService]);

  const handleViewportPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setAddOpen(false);
    const startX = e.clientX;
    const startY = e.clientY;
    const origPan = { ...pan };
    setGrabbing(true);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      setPan({ x: origPan.x + (ev.clientX - startX), y: origPan.y + (ev.clientY - startY) });
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      setGrabbing(false);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => clampZoom(z - e.deltaY * 0.002));
    } else {
      // Two-finger trackpad scroll pans. React's wheel event is passive by
      // default; avoid calling preventDefault here (it'd throw).
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const canCreate = canWrite(workspace.data);

  const gridStep = 22 * zoom;
  const viewportStyle = {
    backgroundImage:
      'radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px)',
    backgroundPosition: `${pan.x}px ${pan.y}px`,
    backgroundSize: `${gridStep}px ${gridStep}px`,
    backgroundColor: 'var(--color-bg)',
    // CSS var for dot color — defined at runtime per theme.
    ['--canvas-dot' as string]:
      'color-mix(in oklch, var(--color-fg) 10%, transparent)',
  } as React.CSSProperties;

  const showEmpty = services.data && serviceList.length === 0;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ cursor: grabbing ? 'grabbing' : 'default' }}
    >
      <div
        ref={viewportRef}
        className={[
          'absolute inset-0 overflow-hidden',
          grabbing ? 'cursor-grabbing' : 'cursor-grab',
        ].join(' ')}
        style={viewportStyle}
        onPointerDown={handleViewportPointerDown}
        onWheel={handleWheel}
      >
        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {serviceList.map((s) => {
            const pos = layout[s.id];
            if (!pos) return null;
            return (
              <CanvasServiceNode
                key={s.id}
                state={{ service: s, latestDeployment: latestByServiceId.get(s.id) }}
                x={pos.x}
                y={pos.y}
                zoom={zoom}
                selected={selectedServiceId === s.id}
                onSelect={(id) => {
                  onSelectService(id);
                  setAddOpen(false);
                }}
                onDrag={updatePos}
                onDragCommit={persistLayout}
              />
            );
          })}
        </div>

        {/* Floating title-bar: project name + Add service */}
        <div
          className={[
            'pointer-events-none absolute left-0 right-0 top-0 z-[4] flex items-center justify-between gap-3 px-5 py-3',
            'bg-gradient-to-b from-[var(--color-bg)] to-transparent',
            selectedServiceId ? 'pr-[calc(min(720px,80vw)+20px)]' : '',
          ].join(' ')}
        >
          <div className="pointer-events-auto flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">
            <span>{project.name}</span>
          </div>
          {canCreate ? (
            <Button
              className="pointer-events-auto h-8 px-3 text-[12px]"
              onClick={(e) => {
                e.stopPropagation();
                setAddOpen((o) => !o);
              }}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add service
            </Button>
          ) : null}
        </div>

        {/* Zoom pill */}
        <div className="pointer-events-none absolute left-4 top-[60px] z-[5] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-muted)]">
          {Math.round(zoom * 100)}%
        </div>

        {/* Add service popover */}
        <AnimatePresence>
          {addOpen && canCreate ? (
            <AddServicePopover
              key="add-popover"
              workspaceSlug={workspaceSlug}
              projectSlug={projectSlug}
              onClose={() => setAddOpen(false)}
            />
          ) : null}
        </AnimatePresence>

        {/* Tool dock */}
        <ToolDock
          onZoomIn={() => setZoom((z) => clampZoom(z + 0.1))}
          onZoomOut={() => setZoom((z) => clampZoom(z - 0.1))}
          onFit={() => fit()}
        />

        {showEmpty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto">
              <EmptyState
                title="No services yet"
                body="A service runs a container in this project. Add one to get started."
                cta={
                  canCreate ? (
                    <div className="flex items-center gap-2">
                      <Link
                        to="/w/$workspaceSlug/projects/$projectSlug/templates"
                        params={{ workspaceSlug, projectSlug }}
                      >
                        <Button variant="secondary">Start from template</Button>
                      </Link>
                      <Link
                        to="/w/$workspaceSlug/projects/$projectSlug/new"
                        params={{ workspaceSlug, projectSlug }}
                      >
                        <Button>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Blank service
                        </Button>
                      </Link>
                    </div>
                  ) : null
                }
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {selectedServiceId && selectedService ? (
          <Drawer
            key={selectedService.id}
            workspaceSlug={workspaceSlug}
            projectSlug={projectSlug}
            service={selectedService}
            activeTab={activeTab}
            onChangeTab={onChangeTab}
            onClose={() => onSelectService(null)}
            shouldReduce={!!shouldReduce}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Drawer({
  shouldReduce,
  ...props
}: {
  workspaceSlug: string;
  projectSlug: string;
  service: ServiceSummary;
  activeTab?: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  onClose: () => void;
  shouldReduce: boolean;
}) {
  return (
    <motion.div
      variants={slideInRight}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={shouldReduce ? { duration: 0 } : spring.smooth}
      className="absolute right-0 top-0 bottom-0 z-10 border-l border-[var(--color-border)] shadow-[-12px_0_32px_rgba(0,0,0,0.25)]"
      style={{ width: 'min(720px, 80vw)' }}
    >
      <CanvasDrawer {...props} />
    </motion.div>
  );
}
