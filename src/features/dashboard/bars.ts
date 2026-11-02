import { addDays, formatDate, fromISODate, monthShort, toISODate, weekdayShort } from '@/lib/date'
import { formatMoney, roundMoney } from '@/lib/money'
import type { DailyRow } from './api'
import type { Bar } from './widgets'

export type ChartPeriod = 'week' | 'month' | 'year'

/** First day of the chart range for each period, ending today. */
export function periodStart(period: ChartPeriod, today: string): string {
  if (period === 'week') return addDays(today, -6)
  if (period === 'month') return addDays(today, -29)
  // 12 calendar months including the current one
  const d = fromISODate(today)
  return toISODate(new Date(d.getFullYear(), d.getMonth() - 11, 1))
}

export function buildBars(rows: DailyRow[], period: ChartPeriod, today: string): Bar[] {
  if (period !== 'year') {
    return rows.map((r) => ({
      key: r.day,
      label: r.day === today ? 'Sot' : period === 'week' ? weekdayShort(r.day) : String(fromISODate(r.day).getDate()),
      value: r.total,
      highlight: r.day === today,
      title: `${formatDate(r.day)}: ${formatMoney(r.total)}`,
    }))
  }
  const months = new Map<string, number>()
  for (const r of rows) {
    const key = r.day.slice(0, 7)
    months.set(key, (months.get(key) ?? 0) + r.total)
  }
  const current = today.slice(0, 7)
  return [...months.entries()].map(([key, total]) => {
    const value = roundMoney(total)
    const label = monthShort(Number(key.slice(5, 7)) - 1)
    return { key, label, value, highlight: key === current, title: `${label} ${key.slice(0, 4)}: ${formatMoney(value)}` }
  })
}
