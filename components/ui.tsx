import { cn } from '@/lib/utils';

/* ─── Brand mark ─────────────────────────────────────────────────────────── */
export function Logo({
  className,
  withWordmark = true,
}: {
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="relative grid h-7 w-7 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/30">
        {/* upward candlestick mark */}
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary" fill="none">
          <path
            d="M4 16l4-5 4 3 7-8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M15 6h5v5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-tight">
          Clear<span className="text-primary">Trade</span>
        </span>
      )}
    </span>
  );
}

/* ─── Panel / card ───────────────────────────────────────────────────────── */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-panel',
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-border px-4 py-2.5',
        className
      )}
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      {right}
    </div>
  );
}

/* ─── Status ─────────────────────────────────────────────────────────────── */
type Tone = 'profit' | 'loss' | 'warning' | 'accent' | 'muted';

const dotTone: Record<Tone, string> = {
  profit: 'text-profit',
  loss: 'text-loss',
  warning: 'text-warning',
  accent: 'text-primary',
  muted: 'text-muted-foreground',
};

export function StatusDot({
  tone = 'muted',
  pulse,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full bg-current',
        dotTone[tone],
        pulse && 'animate-pulse-dot',
        className
      )}
    />
  );
}

const STATUS_TONE: Record<string, Tone> = {
  active: 'profit',
  healthy: 'profit',
  provisioning: 'accent',
  pending: 'muted',
  paused: 'warning',
  degraded: 'warning',
  past_due: 'warning',
  cancelled: 'loss',
  unhealthy: 'loss',
  unknown: 'muted',
};

const badgeTone: Record<Tone, string> = {
  profit: 'border-profit/30 bg-profit/10 text-profit',
  loss: 'border-loss/30 bg-loss/10 text-loss',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  accent: 'border-primary/30 bg-primary/10 text-primary',
  muted: 'border-border-strong bg-surface-2 text-muted-foreground',
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = STATUS_TONE[status] ?? 'muted';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        badgeTone[tone],
        className
      )}
    >
      <StatusDot tone={tone} pulse={tone === 'accent' || status === 'active'} />
      {status}
    </span>
  );
}

/* ─── P&L value ──────────────────────────────────────────────────────────── */
export function PnL({
  value,
  suffix = '%',
  className,
  showSign = true,
}: {
  value: number;
  suffix?: string;
  className?: string;
  showSign?: boolean;
}) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        'tnum font-mono font-medium',
        up ? 'text-profit' : 'text-loss',
        className
      )}
    >
      {showSign ? (up ? '▲ ' : '▼ ') : ''}
      {showSign && up ? '+' : ''}
      {value.toFixed(2)}
      {suffix}
    </span>
  );
}

/* ─── Stat block ─────────────────────────────────────────────────────────── */
export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-4 py-3', className)}>
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div className="tnum mt-1 font-mono text-xl font-semibold tracking-tight">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

/* ─── Sparkline ──────────────────────────────────────────────────────────── */
export function Sparkline({
  data,
  className,
  up = true,
  width = 240,
  height = 56,
}: {
  data: number[];
  className?: string;
  up?: boolean;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d - min) / span) * (height - 6) - 3;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const stroke = up ? 'hsl(var(--profit))' : 'hsl(var(--loss))';
  const id = `spark-${up ? 'u' : 'd'}-${data.length}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── Buttons ────────────────────────────────────────────────────────────── */
export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 active:brightness-95 disabled:opacity-50',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-md border border-loss/40 bg-loss/10 px-4 py-2 text-sm font-medium text-loss transition hover:bg-loss/20',
};

/* Deterministic pseudo-data for mock charts (no Math.random — stable SSR). */
export function mockSeries(seed: number, n = 40, drift = 1): number[] {
  const out: number[] = [];
  let v = 100;
  for (let i = 0; i < n; i++) {
    const wave = Math.sin((i + seed) * 0.6) + Math.sin((i + seed) * 0.17) * 1.6;
    v += wave + drift * 0.4;
    out.push(v);
  }
  return out;
}
