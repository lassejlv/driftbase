import type { ServiceSummary } from './types';

export interface NodePos {
  x: number;
  y: number;
}

export type Layout = Record<string, NodePos>;

export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 88;

const COLUMN_STEP_X = 320;
const BASE_X = 80;
const BASE_Y = 160;

function storageKey(projectId: string) {
  return `zediz:canvas-layout:${projectId}`;
}

function layoutForIndex(i: number): NodePos {
  return { x: BASE_X + i * COLUMN_STEP_X, y: BASE_Y };
}

export function defaultLayout(services: ServiceSummary[]): Layout {
  const out: Layout = {};
  services.forEach((s, i) => {
    out[s.id] = layoutForIndex(i);
  });
  return out;
}

function firstUnusedSlot(existing: Layout, services: ServiceSummary[]): NodePos {
  const used = new Set(
    Object.values(existing).map((p) => `${Math.round(p.x)}:${Math.round(p.y)}`),
  );
  for (let i = 0; i < services.length + 8; i++) {
    const p = layoutForIndex(i);
    if (!used.has(`${p.x}:${p.y}`)) return p;
  }
  return layoutForIndex(services.length);
}

export function loadLayout(projectId: string, services: ServiceSummary[]): Layout {
  if (typeof window === 'undefined') return defaultLayout(services);

  let stored: Layout = {};
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        for (const [id, pos] of Object.entries(parsed as Record<string, unknown>)) {
          if (
            pos &&
            typeof pos === 'object' &&
            typeof (pos as NodePos).x === 'number' &&
            typeof (pos as NodePos).y === 'number'
          ) {
            stored[id] = { x: (pos as NodePos).x, y: (pos as NodePos).y };
          }
        }
      }
    }
  } catch {
    stored = {};
  }

  const current: Layout = {};
  const ids = new Set(services.map((s) => s.id));
  for (const s of services) {
    if (stored[s.id]) {
      current[s.id] = stored[s.id];
    }
  }
  for (const s of services) {
    if (!current[s.id]) {
      current[s.id] = firstUnusedSlot(current, services);
    }
  }
  // Evict stored entries for services that no longer exist — no need to persist
  // here; saveLayout on next drag will rewrite cleanly. But fold in-memory too.
  void ids;

  return current;
}

export function saveLayout(projectId: string, layout: Layout) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(layout));
  } catch {
    // quota / serialization errors are non-fatal
  }
}

export interface Viewport {
  width: number;
  height: number;
}

export function fitViewport(
  layout: Layout,
  viewport: Viewport,
  maxZoom = 1.3,
): { zoom: number; pan: NodePos } {
  const positions = Object.values(layout);
  if (positions.length === 0 || viewport.width === 0 || viewport.height === 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }

  const pad = 48;
  const minX = Math.min(...positions.map((p) => p.x)) - pad;
  const minY = Math.min(...positions.map((p) => p.y)) - pad;
  const maxX = Math.max(...positions.map((p) => p.x + NODE_WIDTH)) + pad;
  const maxY = Math.max(...positions.map((p) => p.y + NODE_HEIGHT)) + pad;

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const zoom = Math.min(maxZoom, viewport.width / contentW, viewport.height / contentH);

  const pan = {
    x: -minX * zoom + (viewport.width - contentW * zoom) / 2,
    y: -minY * zoom + (viewport.height - contentH * zoom) / 2,
  };

  return { zoom, pan };
}

export function clampZoom(z: number) {
  return Math.max(0.3, Math.min(2.5, z));
}
