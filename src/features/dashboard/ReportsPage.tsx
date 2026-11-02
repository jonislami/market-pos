import { useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Dialog, Input, Pagination, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { useProfileNames } from '@/features/stock/api'
import { cn } from '@/lib/cn'
import { addDays, formatDate, formatTime, fromISODate, monthShort, toISODate, todayISO } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { formatMoney, formatReceiptNo, roundMoney } from '@/lib/money'
import { formatPercent } from '@/lib/text'
import { formatQty, UNIT_LABELS } from '@/lib/units'
import { useCashierReport, useDailyReport, useSaleItems, useSalesList, useTopProducts, useVatReport, type DailyRow, type SaleRow } from './api'
import { exportSalesReport } from './exportReport'
import { defaultSettings, useRegisters, useStoreSettings } from '@/features/settings/api'
import { printReceipt } from '@/lib/printer/print'
import type { VatRate } from '@/types/database'
import { BarChart, KpiCard, type Bar } from './widgets'

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'year' | 'custom'

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Sot' },
  { value: 'yesterday', label: 'Dje' },
  { value: 'week', label: '7 ditët e fundit' },
  { value: 'month', label: 'Ky muaj' },
  { value: 'lastMonth', label: 'Muaji i kaluar' },
  { value: 'year', label: 'Ky vit' },
  { value: 'custom', label: 'Periudhë tjetër' },
]

function presetRange(p: Preset, today: string): { from: string; to: string } {
  const d = fromISODate(today)
  switch (p) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'week':
      return { from: addDays(today, -6), to: today }
    case 'month':
      return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: today }
    case 'lastMonth':
      return {
        from: toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        to: toISODate(new Date(d.getFullYear(), d.getMonth(), 0)),
      }
    case 'year':
      return { from: `${d.getFullYear()}-01-01`, to: today }
    default:
      return { from: addDays(today, -6), to: today }
  }
}

/** Daily bars for up to two months, monthly bars beyond that. */
function reportBars(rows: DailyRow[]): Bar[] {
  if (rows.length <= 62) {
    return rows.map((r) => {
      const d = fromISODate(r.day)
      return { key: r.day, label: `${d.getDate()}.${d.getMonth() + 1}`, value: r.total, title: `${formatDate(r.day)}: ${formatMoney(r.total)}` }
    })
  }
  const months = new Map<string, number>()
  for (const r of rows) months.set(r.day.slice(0, 7), (months.get(r.day.slice(0, 7)) ?? 0) + r.total)
  return [...months.entries()].map(([key, total]) => {
    const label = `${monthShort(Number(key.slice(5)) - 1)} ${key.slice(2, 4)}`
    return { key, label, value: roundMoney(total), title: `${label}: ${formatMoney(total)}` }
  })
}

const SALES_PAGE = 25

export function ReportsPage() {
  const today = todayISO()
  const [preset, setPreset] = useState<Preset>('today')
  const [custom, setCustom] = useState(() => presetRange('week', today))
  const { from, to } = preset === 'custom' ? custom : presetRange(preset, today)
  const validRange = from <= to

  const daily = useDailyReport(from, to)
  const top = useTopProducts(from, to, 15, 'revenue')
  const vat = useVatReport(from, to)
  const cashiers = useCashierReport(from, to)
  const [salesPage, setSalesPage] = useState(1)
  const sales = useSalesList(from, to, salesPage, SALES_PAGE)
  const names = useProfileNames()
  const [viewing, setViewing] = useState<SaleRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const sum = useMemo(() => {
    const rows = daily.data ?? []
    const s = { total: 0, count: 0, vat: 0, cost: 0, cash: 0, card: 0 }
    for (const r of rows) {
      s.total += r.total
      s.count += r.salesCount
      s.vat += r.totalVat
      s.cost += r.cost
      s.cash += r.cash
      s.card += r.card
    }
    return { ...s, profit: roundMoney(s.total - s.cost) }
  }, [daily.data])

  const bars = useMemo(() => reportBars(daily.data ?? []), [daily.data])
  const loadError = daily.error ?? top.error ?? vat.error ?? cashiers.error ?? sales.error

  function changePreset(p: Preset) {
    setPreset(p)
    setSalesPage(1)
  }

  async function onExport() {
    setExportError(null)
    setExporting(true)
    try {
      await exportSalesReport(from, to, daily.data ?? [], vat.data ?? [], cashiers.data ?? [])
    } catch (err) {
      setExportError(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Raportet"
        subtitle={from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`}
        actions={
          <Button variant="secondary" loading={exporting} disabled={!validRange || !daily.data} onClick={() => void onExport()}>
            Eksporto në Excel
          </Button>
        }
      />

      <Card className="flex flex-wrap items-end gap-3">
        <Select label="Periudha" value={preset} onChange={(e) => changePreset(e.target.value as Preset)} options={PRESETS} wrapperClassName="w-full sm:w-52" />
        {preset === 'custom' && (
          <>
            <Input label="Nga" type="date" value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} wrapperClassName="flex-1 sm:flex-none" />
            <Input label="Deri" type="date" value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} wrapperClassName="flex-1 sm:flex-none" />
          </>
        )}
        {!validRange && <p className="text-sm text-warn-700">Data "Nga" duhet të jetë para datës "Deri".</p>}
      </Card>

      {(loadError || exportError) && <Card className="text-sm text-warn-700">{errorMessage(loadError ?? { message: exportError })}</Card>}

      {validRange && (
        <>
          <section aria-label="Përmbledhja" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <KpiCard label="Shitjet" value={formatMoney(sum.total)} footer={`Kesh ${formatMoney(sum.cash)} · Kartelë ${formatMoney(sum.card)}`} />
            <KpiCard label="Fatura" value={sum.count} footer={`Mesatarja ${formatMoney(sum.count ? sum.total / sum.count : 0)}`} />
            <KpiCard label="Fitimi bruto" value={formatMoney(sum.profit)} footer={`Marzha ${sum.total ? formatPercent(sum.profit / sum.total) : '—'}`} />
            <KpiCard label="TVSH e mbledhur" value={formatMoney(sum.vat)} footer={`Pa TVSH ${formatMoney(roundMoney(sum.total - sum.vat))}`} />
          </section>

          {bars.length > 1 && (
            <Card className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">Shitjet sipas {bars.length && bars[0].key.length === 7 ? 'muajve' : 'ditëve'}</h2>
              {daily.isPending ? (
                <LoaderCircle className="size-6 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
              ) : (
                <BarChart bars={bars} height={200} showValues={bars.length <= 12} />
              )}
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card padded={false}>
              <h2 className="p-5 pb-3 text-base font-semibold">Produktet më të shitura</h2>
              {top.isPending ? (
                <LoaderCircle className="m-5 size-6 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
              ) : !top.data?.length ? (
                <p className="px-5 pb-5 text-sm text-muted">Nuk ka shitje në këtë periudhë.</p>
              ) : (
                <Table shaded>
                  <THead>
                    <TR>
                      <TH className="pl-5">Produkti</TH>
                      <TH num>Sasia</TH>
                      <TH num>Shitjet</TH>
                      <TH num>Fitimi</TH>
                      <TH num className="pr-5">Marzha</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {top.data.map((t) => {
                      const profit = roundMoney(t.revenue - t.cost)
                      return (
                        <TR key={t.productId}>
                          <TD className="pl-5 font-semibold">{t.name}</TD>
                          <TD num>
                            {formatQty(t.quantity)} {t.unit ? UNIT_LABELS[t.unit] : ''}
                          </TD>
                          <TD num>{formatMoney(t.revenue)}</TD>
                          <TD num className={cn(profit < 0 && 'text-warn-700')}>
                            {formatMoney(profit)}
                          </TD>
                          <TD num className="pr-5">
                            {t.revenue ? formatPercent(profit / t.revenue) : '—'}
                          </TD>
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              )}
            </Card>

            <div className="flex flex-col gap-4">
              <Card padded={false}>
                <h2 className="p-5 pb-3 text-base font-semibold">TVSH sipas normës</h2>
                <Table shaded>
                  <THead>
                    <TR>
                      <TH className="pl-5">Norma</TH>
                      <TH num>Baza</TH>
                      <TH num>TVSH</TH>
                      <TH num className="pr-5">Bruto</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(vat.data ?? []).map((v) => (
                      <TR key={v.rate}>
                        <TD className="pl-5">{v.rate}%</TD>
                        <TD num>{formatMoney(roundMoney(v.gross - v.vat))}</TD>
                        <TD num>{formatMoney(v.vat)}</TD>
                        <TD num className="pr-5">
                          {formatMoney(v.gross)}
                        </TD>
                      </TR>
                    ))}
                    {!vat.data?.length && (
                      <TR>
                        <TD colSpan={4} className="pl-5 text-muted">
                          —
                        </TD>
                      </TR>
                    )}
                  </TBody>
                </Table>
              </Card>

              <Card padded={false}>
                <h2 className="p-5 pb-3 text-base font-semibold">Sipas arkëtarit</h2>
                <Table shaded>
                  <THead>
                    <TR>
                      <TH className="pl-5">Arkëtari</TH>
                      <TH num>Fatura</TH>
                      <TH num className="pr-5">Shitjet</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(cashiers.data ?? []).map((c) => (
                      <TR key={c.cashierId ?? 'none'}>
                        <TD className="pl-5">{c.name}</TD>
                        <TD num>{c.salesCount}</TD>
                        <TD num className="pr-5">
                          {formatMoney(c.total)}
                        </TD>
                      </TR>
                    ))}
                    {!cashiers.data?.length && (
                      <TR>
                        <TD colSpan={3} className="pl-5 text-muted">
                          —
                        </TD>
                      </TR>
                    )}
                  </TBody>
                </Table>
              </Card>
            </div>
          </div>

          <Card padded={false}>
            <h2 className="p-5 pb-3 text-base font-semibold">Faturat</h2>
            {sales.isPending ? (
              <LoaderCircle className="m-5 size-6 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
            ) : !sales.data?.rows.length ? (
              <p className="px-5 pb-5 text-sm text-muted">Nuk ka fatura në këtë periudhë.</p>
            ) : (
              <>
                <Table shaded>
                  <THead>
                    <TR>
                      <TH className="pl-5">Nr.</TH>
                      <TH>Data</TH>
                      <TH>Arkëtari</TH>
                      <TH>Pagesa</TH>
                      <TH num>Rreshta</TH>
                      <TH num className="pr-5">
                        Totali
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {sales.data.rows.map((s) => (
                      <TR key={s.id} className="cursor-pointer" onClick={() => setViewing(s)}>
                        <TD className="pl-5 font-semibold tabular-nums">{formatReceiptNo(s.number)}</TD>
                        <TD className="tabular-nums">
                          {formatDate(s.createdAt)} {formatTime(new Date(s.createdAt))}
                        </TD>
                        <TD>{(s.cashierId && names.data?.get(s.cashierId)) ?? '—'}</TD>
                        <TD>{s.payment === 'cash' ? 'Kesh' : 'Kartelë'}</TD>
                        <TD num>{s.itemCount}</TD>
                        <TD num className="pr-5 font-semibold">
                          {formatMoney(s.total)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination page={salesPage} pageSize={SALES_PAGE} total={sales.data.total} onChange={setSalesPage} className="px-5 py-3.5" />
              </>
            )}
          </Card>
        </>
      )}

      <SaleDialog sale={viewing} onClose={() => setViewing(null)} cashierName={viewing?.cashierId ? names.data?.get(viewing.cashierId) : undefined} />
    </>
  )
}

function SaleDialog({ sale, onClose, cashierName }: { sale: SaleRow | null; onClose: () => void; cashierName?: string }) {
  const items = useSaleItems(sale?.id ?? null)
  const settings = useStoreSettings()
  const registers = useRegisters()
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  async function reprint() {
    if (!sale || !items.data) return
    setPrinting(true)
    setPrintError(null)
    try {
      await printReceipt(
        {
          store: settings.data ?? defaultSettings,
          number: sale.number,
          date: new Date(sale.createdAt),
          registerName: registers.data?.find((r) => r.id === sale.registerId)?.name ?? `Arka ${sale.registerId ?? ''}`,
          cashierName: cashierName ?? '',
          items: items.data.map((i) => ({
            name: i.name,
            qty: i.quantity,
            unitPrice: i.unitPrice,
            total: i.lineTotal,
            vatRate: i.vatRate as VatRate,
          })),
          total: sale.total,
          payment: sale.payment,
          paid: sale.paid,
          change: sale.change,
          reprint: true,
        },
        { copies: 1, openDrawer: false },
      )
    } catch (err) {
      setPrintError(errorMessage(err))
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog
      open={sale !== null}
      onClose={onClose}
      title={sale ? `Fatura ${formatReceiptNo(sale.number)}` : ''}
      footer={
        <Button variant="secondary" block loading={printing} disabled={!items.data} onClick={() => void reprint()}>
          Riprinto faturën
        </Button>
      }
    >
      {sale && (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-muted">
            {formatDate(sale.createdAt)} {formatTime(new Date(sale.createdAt))} · {cashierName ?? '—'} · {sale.payment === 'cash' ? 'Kesh' : 'Kartelë'}
          </p>
          {items.isPending ? (
            <LoaderCircle className="mx-auto size-6 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
          ) : (
            <ul className="flex flex-col divide-y divide-[#EEF1EE] rounded-[10px] border border-line">
              {(items.data ?? []).map((i) => (
                <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{i.name}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {formatQty(i.quantity)} × {formatMoney(i.unitPrice)} · TVSH {i.vatRate}%
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="ml-auto flex w-full max-w-[240px] flex-col gap-1">
            <div className="flex justify-between text-muted">
              <span>TVSH</span>
              <span className="tabular-nums">{formatMoney(sale.totalVat)}</span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>Totali</span>
              <span className="tabular-nums">{formatMoney(sale.total)}</span>
            </div>
            {sale.payment === 'cash' && sale.paid !== null && (
              <>
                <div className="flex justify-between text-muted">
                  <span>Paguar</span>
                  <span className="tabular-nums">{formatMoney(sale.paid)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Kusuri</span>
                  <span className="tabular-nums">{formatMoney(sale.change ?? 0)}</span>
                </div>
              </>
            )}
          </div>
          {printError && <p className="rounded-[10px] bg-warn-100 px-3 py-2 text-warn-700">{printError}</p>}
        </div>
      )}
    </Dialog>
  )
}
