import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { formatQty, UNIT_LABELS } from '@/lib/units'
import type { TopProduct } from './api'

const compact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export interface Bar {
  key: string
  label: string
  value: number
  highlight?: boolean
  /** Accessible / tooltip description, e.g. "e hënë 2.11: €1,248.60". */
  title: string
}

/** Vertical bar chart; the highlighted bar (today) is dark green, the rest light. */
export function BarChart({ bars, height = 230, showValues = true, className }: { bars: Bar[]; height?: number; showValues?: boolean; className?: string }) {
  const max = Math.max(...bars.map((b) => b.value), 1)
  const labelEvery = bars.length > 14 ? Math.ceil(bars.length / 8) : 1
  return (
    <div className={cn('flex flex-col gap-2', className)} role="img" aria-label={bars.map((b) => b.title).join(', ')}>
      <div
        className="grid items-end border-b border-line"
        style={{ height, gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: bars.length > 14 ? 3 : 14 }}
      >
        {bars.map((b) => (
          <div key={b.key} className="flex h-full flex-col items-center justify-end gap-1.5" title={b.title}>
            {showValues && (
              <span className={cn('text-xs tabular-nums', b.highlight ? 'font-bold text-brand-600' : 'text-muted')}>{compact.format(b.value)}</span>
            )}
            <div
              className={cn('w-full max-w-[44px] rounded-t-md transition-[height]', b.highlight ? 'bg-brand-600' : 'bg-[#BFE3D1]')}
              // Keep a sliver visible for zero days so the axis does not look broken.
              style={{ height: `${Math.max((b.value / max) * (height - (showValues ? 30 : 8)), b.value > 0 ? 3 : 1)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="grid text-center text-xs text-muted" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: bars.length > 14 ? 3 : 14 }}>
        {bars.map((b, i) => (
          <span key={b.key} className={cn('truncate', b.highlight && 'font-semibold text-ink')}>
            {i % labelEvery === 0 || b.highlight ? b.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

export function KpiCard({ label, value, footer, tone = 'default', to }: { label: string; value: ReactNode; footer?: ReactNode; tone?: 'default' | 'warn'; to?: string }) {
  const body = (
    <>
      <span className={cn('text-[13px]', tone === 'warn' ? 'font-semibold text-warn-700' : 'font-medium text-muted')}>{label}</span>
      <span className="text-[28px] font-bold tabular-nums leading-tight">{value}</span>
      {footer && <span className={cn('text-[13px]', tone === 'warn' ? 'font-medium text-warn-700' : 'text-muted')}>{footer}</span>}
    </>
  )
  const className = cn(
    'flex flex-col gap-2 rounded-card border p-5 text-ink no-underline',
    tone === 'warn' ? 'border-[#F3C9A8] bg-[#FFF4EC] hover:text-ink' : 'border-line bg-white',
  )
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** "▲ 8.4%" / "▼ 3.1%" compared with a previous value; nothing when there is no basis. */
export function Trend({ current, previous, className }: { current: number; previous: number; className?: string }) {
  if (previous <= 0) return null
  const pct = ((current - previous) / previous) * 100
  const up = pct >= 0
  return (
    <span className={cn('font-semibold tabular-nums', up ? 'text-brand-600' : 'text-warn-700', className)}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

export function TopProductsList({ items, metric = 'qty' }: { items: TopProduct[]; metric?: 'qty' | 'revenue' }) {
  const value = (t: TopProduct) => (metric === 'qty' ? t.quantity : t.revenue)
  const max = Math.max(...items.map(value), 1)
  if (!items.length) return <p className="py-6 text-sm text-muted">Ende nuk ka shitje sot.</p>
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((t) => (
        <li key={t.productId} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate">{t.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {metric === 'qty' ? `${formatQty(t.quantity)} ${t.unit ? UNIT_LABELS[t.unit] : ''}` : formatMoney(t.revenue)}
            </span>
          </div>
          <div className="h-2 rounded bg-[#EEF1EE]">
            <div className="h-2 rounded bg-brand-600" style={{ width: `${(value(t) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
