import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, LoaderCircle, Plus, ShoppingCart } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { useStoreName } from '@/features/settings/api'
import { Badge, buttonClasses, Card, Table, TBody, TD, TH, THead, TR, Tabs } from '@/components/ui'
import { useProducts } from '@/features/products/api'
import { lowStockProducts } from '@/features/stock/SideCards'
import { cn } from '@/lib/cn'
import { addDays, formatLongDate, formatTime, todayISO, weekdayName } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { formatMoney, formatReceiptNo, roundMoney } from '@/lib/money'
import { STOCK_BADGE, stockStatus } from '@/lib/stock'
import { formatPercent } from '@/lib/text'
import { formatQty } from '@/lib/units'
import { useDailyReport, useSalesList, useTopProducts, type SaleRow } from './api'
import { buildBars, periodStart, type ChartPeriod } from './bars'
import { BarChart, KpiCard, TopProductsList, Trend } from './widgets'

const periodTabs = [
  { value: 'week' as const, label: 'Javë' },
  { value: 'month' as const, label: 'Muaj' },
  { value: 'year' as const, label: 'Vit' },
]

const chartTitles: Record<ChartPeriod, string> = {
  week: '7 ditët e fundit',
  month: '30 ditët e fundit',
  year: '12 muajt e fundit',
}

const paymentLabel = (p: SaleRow['payment']) => (p === 'cash' ? 'Kesh' : 'Kartelë')

export function DashboardPage() {
  const today = todayISO()
  const weekAgo = addDays(today, -7)
  const [period, setPeriod] = useState<ChartPeriod>('week')
  const storeName = useStoreName()

  // Today plus the same weekday last week, for the trend.
  const kpi = useDailyReport(weekAgo, today)
  const chart = useDailyReport(periodStart(period, today), today)
  const top = useTopProducts(today, today, 5, 'qty')
  const recent = useSalesList(addDays(today, -30), today, 1, 4)
  const products = useProducts()

  const todayRow = kpi.data?.find((r) => r.day === today)
  const lastWeekRow = kpi.data?.find((r) => r.day === weekAgo)
  const total = todayRow?.total ?? 0
  const count = todayRow?.salesCount ?? 0
  const profit = roundMoney(total - (todayRow?.cost ?? 0))
  const low = useMemo(() => lowStockProducts(products.data ?? []), [products.data])
  const bars = useMemo(() => buildBars(chart.data ?? [], period, today), [chart.data, period, today])

  const loadError = kpi.error ?? chart.error ?? top.error

  const trend = (
    <>
      <Trend current={total} previous={lastWeekRow?.total ?? 0} /> <span className="text-muted">nga {weekdayName(weekAgo)} e kaluar</span>
    </>
  )

  return (
    <>
      {/* ===== Phone header ===== */}
      <section className="-mx-4 -mt-4 flex flex-col gap-4 bg-brand-900 px-5 pb-6 pt-[max(env(safe-area-inset-top),24px)] text-white md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-[#B5C7BD]">{formatLongDate().replace(/ \d{4}$/, '')}</span>
            <span className="text-xl font-bold">{storeName}</span>
          </div>
          <Link to="/stoku" aria-label={`${low.length} produkte me stok të ulët`} className="relative flex size-12 items-center justify-center rounded-xl bg-[#1B3A2C] text-white hover:text-white">
            <Bell className="size-5" aria-hidden />
            {low.length > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-[#F59E0B]" />}
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-[#B5C7BD]">Shitjet sot</span>
          <span className="flex items-baseline gap-2.5">
            <span className="text-[36px] font-bold tabular-nums tracking-[-0.02em]">{formatMoney(total)}</span>
            <Trend current={total} previous={lastWeekRow?.total ?? 0} className="text-sm !text-[#6EE7B0]" />
          </span>
        </div>
      </section>

      {/* ===== Desktop header ===== */}
      <div className="hidden md:block">
        <PageHeader
          eyebrow={formatLongDate()}
          title="Paneli i ditës"
          actions={
            <>
              <Link to="/stoku" className={buttonClasses({ variant: 'secondary' })}>
                <Plus className="size-4" strokeWidth={2.2} aria-hidden />
                Hyrje malli
              </Link>
              <Link to="/arka" className={buttonClasses()}>
                <ShoppingCart className="size-4" strokeWidth={2.2} aria-hidden />
                Shitje e re
              </Link>
            </>
          }
        />
      </div>

      {loadError && <Card className="text-sm text-warn-700">Raportet nuk u ngarkuan: {errorMessage(loadError)}</Card>}

      {/* ===== KPIs ===== */}
      <section aria-label="Treguesit kryesorë" className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(210px,1fr))] md:gap-4">
        <div className="hidden md:contents">
          <KpiCard label="Shitjet sot" value={formatMoney(total)} footer={trend} />
        </div>
        <KpiCard label="Fatura (kuponë)" value={count} footer={<span className="hidden md:inline">Mesatarja {formatMoney(count ? total / count : 0)} / faturë</span>} />
        <KpiCard label="Fitimi bruto" value={formatMoney(profit)} footer={<span className="hidden md:inline">Marzha {total ? formatPercent(profit / total) : '—'}</span>} />
        <div className="hidden md:contents">
          <KpiCard label="Stok i ulët" tone="warn" value={`${low.length} produkte`} footer="Shiko listën →" to="/stoku" />
        </div>
      </section>

      {/* Phone low-stock banner */}
      {low.length > 0 && (
        <Link to="/stoku" className="flex items-center gap-3 rounded-card border border-[#F3C9A8] bg-[#FFF4EC] p-4 text-ink no-underline hover:text-ink md:hidden">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warn-100 text-lg font-bold text-warn-700">!</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{low.length} produkte me stok të ulët</span>
            <span className="truncate text-sm text-warn-700">{low.slice(0, 3).map((p) => p.name).join(', ')}…</span>
          </span>
          <ChevronRight className="size-5 text-warn-700" aria-hidden />
        </Link>
      )}

      {/* ===== Chart + top sellers ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              <span className="hidden md:inline">Shitjet – </span>
              {chartTitles[period]}
            </h2>
            <Tabs variant="segmented" items={periodTabs} value={period} onChange={setPeriod} label="Periudha" className="[&>button]:min-h-9 [&>button]:text-[13px]" />
          </div>
          {chart.error && !chart.data ? (
            <p className="flex h-[230px] items-center justify-center text-center text-sm text-muted">Grafiku nuk u ngarkua.</p>
          ) : chart.isPending ? (
            <div className="flex h-[230px] items-center justify-center">
              <LoaderCircle className="size-6 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
            </div>
          ) : (
            <BarChart bars={bars} showValues={bars.length <= 12} />
          )}
        </Card>

        <Card className="hidden flex-col gap-3.5 md:flex">
          <h2 className="text-base font-semibold">Më të shiturat sot</h2>
          {top.isPending ? <LoaderCircle className="size-6 animate-spin text-brand-600" aria-label="Duke u ngarkuar" /> : <TopProductsList items={top.data ?? []} />}
        </Card>
      </div>

      {/* ===== Reorder + recent invoices ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="hidden md:block">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">Duhet porositur</h2>
            {low.length > 0 && (
              <Link to="/stoku?add=low" className="text-[13px] font-semibold underline">
                Krijo porosi
              </Link>
            )}
          </div>
          {low.length === 0 ? (
            <p className="py-6 text-sm text-muted">Asnjë produkt nën minimum.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Produkti</TH>
                  <TH num>Në stok</TH>
                  <TH num>Minimumi</TH>
                  <TH>Statusi</TH>
                </TR>
              </THead>
              <TBody>
                {low.slice(0, 4).map((p) => {
                  const s = stockStatus(p.stock, p.min_stock)
                  return (
                    <TR key={p.id}>
                      <TD>{p.name}</TD>
                      <TD num>{formatQty(p.stock)}</TD>
                      <TD num>{formatQty(p.min_stock)}</TD>
                      <TD>{s !== 'ok' && <Badge tone={STOCK_BADGE[s].tone}>{STOCK_BADGE[s].label}</Badge>}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">Faturat e fundit</h2>
            <Link to="/raportet" className="text-[13px] font-semibold underline">
              Të gjitha
            </Link>
          </div>
          {recent.isPending ? (
            <LoaderCircle className="size-6 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
          ) : !recent.data?.rows.length ? (
            <p className="py-6 text-sm text-muted">Ende nuk ka shitje.</p>
          ) : (
            <>
              <Table className="hidden md:table">
                <THead>
                  <TR>
                    <TH>Nr.</TH>
                    <TH>Ora</TH>
                    <TH>Pagesa</TH>
                    <TH num>Artikuj</TH>
                    <TH num>Totali</TH>
                  </TR>
                </THead>
                <TBody>
                  {recent.data.rows.map((s) => (
                    <TR key={s.id}>
                      <TD className="tabular-nums">{formatReceiptNo(s.number)}</TD>
                      <TD className="tabular-nums">{formatTime(new Date(s.createdAt))}</TD>
                      <TD>{paymentLabel(s.payment)}</TD>
                      <TD num>{s.itemCount}</TD>
                      <TD num className="font-semibold">
                        {formatMoney(s.total)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <ul className="flex flex-col md:hidden">
                {recent.data.rows.map((s, i) => (
                  <li key={s.id} className={cn('flex items-center justify-between py-3', i > 0 && 'border-t border-[#EEF1EE]')}>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold tabular-nums">{formatReceiptNo(s.number)}</span>
                      <span className="text-xs text-muted">
                        {formatTime(new Date(s.createdAt))} · {paymentLabel(s.payment)} · {s.itemCount} artikuj
                      </span>
                    </span>
                    <span className="font-bold tabular-nums">{formatMoney(s.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  )
}
