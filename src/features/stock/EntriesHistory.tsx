import { useMemo, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { Badge, Button, Card, Dialog, Input, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { formatDate } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { normalizeText } from '@/lib/text'
import { formatQty, UNIT_LABELS } from '@/lib/units'
import type { EntryStatus, Product } from '@/types/database'
import { fetchEntryItems, useDeleteDraft, useEntries, useEntryItems, type EntryListRow } from './api'
import { entryTotals, lineNet } from './entryMath'
import type { EntryFormApi } from './EntryForm'

interface Props {
  products: Product[]
  form: EntryFormApi
  onOpenDraft: () => void
}

function StatusBadge({ status }: { status: EntryStatus }) {
  return status === 'draft' ? <Badge tone="low">Draft</Badge> : <Badge tone="success">Konfirmuar</Badge>
}

export function EntriesHistory({ products, form, onOpenDraft }: Props) {
  const entries = useEntries()
  const deleteDraft = useDeleteDraft()
  const [status, setStatus] = useState<EntryStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<EntryListRow | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = normalizeText(search)
    return (entries.data ?? []).filter(
      (e) =>
        (status === 'all' || e.status === status) &&
        (!q || normalizeText(e.invoice_no ?? '').includes(q) || normalizeText(e.supplier_name ?? '').includes(q)),
    )
  }, [entries.data, status, search])

  async function openDraft(e: EntryListRow) {
    if (form.form.lines.length && form.form.id !== e.id && !window.confirm('Formulari aktual ka produkte. Ta zëvendësoj me këtë draft?')) return
    setError(null)
    setBusyId(e.id)
    try {
      form.loadDraft(e, await fetchEntryItems(e.id))
      onOpenDraft()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  function removeDraft(e: EntryListRow) {
    if (!window.confirm(`Fshi draftin ${e.invoice_no ?? `#${e.id}`}?`)) return
    deleteDraft.mutate(e.id, {
      onSuccess: () => {
        if (form.form.id === e.id) form.reset()
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  const actions = (e: EntryListRow) =>
    e.status === 'draft' ? (
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => removeDraft(e)}>
          Fshi
        </Button>
        <Button size="sm" loading={busyId === e.id} onClick={() => void openDraft(e)}>
          Vazhdo
        </Button>
      </div>
    ) : (
      <Button variant="secondary" size="sm" onClick={() => setViewing(e)}>
        Shiko
      </Button>
    )

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-end gap-2.5 border-b border-[#EEF1EE] p-4">
        <Input
          type="search"
          aria-label="Kërko"
          placeholder="Kërko sipas nr. të faturës ose furnitorit"
          leftIcon={<Search className="size-[18px]" aria-hidden />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapperClassName="flex-[1_1_240px]"
        />
        <Select
          aria-label="Statusi"
          value={status}
          onChange={(e) => setStatus(e.target.value as EntryStatus | 'all')}
          options={[
            { value: 'all', label: 'Të gjitha' },
            { value: 'draft', label: 'Draftet' },
            { value: 'confirmed', label: 'Të konfirmuara' },
          ]}
          wrapperClassName="w-44"
        />
      </div>
      {error && <p className="mx-4 mt-4 rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}

      {entries.isPending ? (
        <div className="flex justify-center py-14">
          <LoaderCircle className="size-7 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
        </div>
      ) : entries.error ? (
        <p className="p-5 text-sm text-warn-700">{errorMessage(entries.error)}</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-muted">Nuk ka hyrje.</p>
      ) : (
        <>
          <Table shaded className="hidden md:table">
            <THead>
              <TR>
                <TH>Data</TH>
                <TH>Nr. i faturës</TH>
                <TH>Furnitori</TH>
                <TH>Pagesa</TH>
                <TH num>Produkte</TH>
                <TH num>Totali</TH>
                <TH>Statusi</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((e) => (
                <TR key={e.id}>
                  <TD className="tabular-nums">{formatDate(e.entry_date)}</TD>
                  <TD className="font-semibold">{e.invoice_no ?? '—'}</TD>
                  <TD>{e.supplier_name ?? '—'}</TD>
                  <TD className="text-muted">{e.payment_terms ?? '—'}</TD>
                  <TD num>{e.item_count}</TD>
                  <TD num className="font-semibold">
                    {e.status === 'confirmed' ? formatMoney(e.total) : '—'}
                  </TD>
                  <TD>
                    <StatusBadge status={e.status} />
                  </TD>
                  <TD className="text-right">{actions(e)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <ul className="flex flex-col divide-y divide-[#EEF1EE] md:hidden">
            {rows.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="font-semibold">{e.invoice_no ?? `Hyrja #${e.id}`}</span>
                    <span className="text-[13px] text-muted">
                      {formatDate(e.entry_date)} · {e.supplier_name ?? 'Pa furnitor'} · {e.item_count} produkte
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <StatusBadge status={e.status} />
                    {e.status === 'confirmed' && <span className="font-bold tabular-nums">{formatMoney(e.total)}</span>}
                  </span>
                </div>
                <div className="flex justify-end">{actions(e)}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      <EntryDetailsDialog entry={viewing} products={products} onClose={() => setViewing(null)} />
    </Card>
  )
}

function EntryDetailsDialog({ entry, products, onClose }: { entry: EntryListRow | null; products: Product[]; onClose: () => void }) {
  const items = useEntryItems(entry?.id ?? null)
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const values = (items.data ?? []).map((i) => ({ quantity: i.quantity, unitCost: i.unit_cost, vatRate: i.vat_rate }))
  const totals = entryTotals(values)

  return (
    <Dialog open={entry !== null} onClose={onClose} title={`Hyrja ${entry?.invoice_no ?? `#${entry?.id ?? ''}`}`} size="lg">
      {entry && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Info label="Furnitori" value={entry.supplier_name ?? '—'} />
            <Info label="Data" value={formatDate(entry.entry_date)} />
            <Info label="Pagesa" value={entry.payment_terms ?? '—'} />
            <Info label="Konfirmuar" value={entry.confirmed_at ? formatDate(entry.confirmed_at) : '—'} />
          </div>
          {entry.note && <p className="rounded-[10px] bg-bg px-3 py-2 text-sm">{entry.note}</p>}
          {items.isPending ? (
            <LoaderCircle className="mx-auto size-6 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
          ) : (
            <div className="rounded-card border border-line">
              <Table shaded>
                <THead>
                  <TR>
                    <TH>Produkti</TH>
                    <TH num>Sasia</TH>
                    <TH num>Kosto / njësi</TH>
                    <TH num>TVSH</TH>
                    <TH num>Vlera</TH>
                  </TR>
                </THead>
                <TBody>
                  {(items.data ?? []).map((i, idx) => {
                    const p = productMap.get(i.product_id)
                    return (
                      <TR key={i.id}>
                        <TD className="font-semibold">{p?.name ?? `#${i.product_id}`}</TD>
                        <TD num>
                          {formatQty(i.quantity)} {p ? UNIT_LABELS[p.unit] : ''}
                        </TD>
                        <TD num>{formatMoney(i.unit_cost)}</TD>
                        <TD num>{i.vat_rate}%</TD>
                        <TD num className="font-semibold">
                          {formatMoney(lineNet(values[idx]))}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </div>
          )}
          <div className="ml-auto flex w-full max-w-[280px] flex-col gap-1 text-sm">
            <div className="flex justify-between text-muted">
              <span>Vlera pa TVSH</span>
              <span className="tabular-nums">{formatMoney(entry.total_net || totals.net)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>TVSH</span>
              <span className="tabular-nums">{formatMoney(entry.total_vat || totals.vat)}</span>
            </div>
            <div className="flex justify-between border-t border-dashed border-field pt-2 text-base font-bold">
              <span>Totali</span>
              <span className="tabular-nums">{formatMoney(entry.total || totals.total)}</span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
