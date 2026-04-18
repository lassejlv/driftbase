import type { ServiceSummary } from '@/lib/types';

export type ServiceKind =
  | 'postgres'
  | 'valkey'
  | 'redis'
  | 'worker'
  | 'fileserver'
  | 'web';

export function kindFor(service: Pick<ServiceSummary, 'source' | 'image_ref' | 'name'>): ServiceKind {
  if (service.source === 'git') return 'web';
  const ref = (service.image_ref ?? '').toLowerCase();
  if (ref.includes('postgres')) return 'postgres';
  if (ref.includes('valkey')) return 'valkey';
  if (ref.includes('redis')) return 'redis';
  if (ref.includes('worker')) return 'worker';
  if (ref.includes('file')) return 'fileserver';
  return 'web';
}

export function ServiceLogo({ kind, size = 18 }: { kind: ServiceKind; size?: number }) {
  const id = `zdz-g-${kind}`;
  switch (kind) {
    case 'postgres':
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#1e40af" />
            </linearGradient>
          </defs>
          <ellipse cx="10" cy="5" rx="6.5" ry="2" fill={`url(#${id})`} />
          <path
            d="M3.5 5v10c0 1.1 2.9 2 6.5 2s6.5-.9 6.5-2V5"
            fill={`url(#${id})`}
          />
          <ellipse
            cx="10"
            cy="10"
            rx="6.5"
            ry="2"
            fill="none"
            stroke="#0d0d11"
            strokeWidth="0.8"
            opacity="0.3"
          />
        </svg>
      );
    case 'valkey':
    case 'redis':
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <path
            d="M10 1.5 L17.5 5.75 V14.25 L10 18.5 L2.5 14.25 V5.75 Z"
            fill={`url(#${id})`}
          />
          <circle cx="10" cy="10" r="2.5" fill="#0d0d11" />
        </svg>
      );
    case 'fileserver':
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#0ea5e9" />
            </linearGradient>
          </defs>
          <rect x="2.5" y="3" width="15" height="14" rx="2.5" fill={`url(#${id})`} />
          <path
            d="M6 8h8M6 11h5"
            stroke="#0d0d11"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'worker':
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
          </defs>
          <path d="M10 2 L17 6 V14 L10 18 L3 14 V6 Z" fill={`url(#${id})`} />
        </svg>
      );
    case 'web':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          <rect x="2.5" y="2.5" width="15" height="15" rx="3.5" fill={`url(#${id})`} />
        </svg>
      );
  }
}
