import { useMemo, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { Badge, Card, Pagination, Select, Table, TBody, TD, TH, THead, TR, type BadgeTone } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatDate, formatTime } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { formatQty, UNIT_LABELS } from '@/lib/units'
import type { MovementType, Product } from '@/types/database'
import { useMovements, useProfileNames } from './api'
import { ProductPicker } from './ProductPicker'

export const MOVEMENT_LABELS: Record<MovementType, { label: string; tone: BadgeTone }> = {
  sale: { label: 'Shitje', tone: 'neutral' },
  entry: { label: 'Hyrje', tone: 'success' },
  writeoff: { label: 'Shkarkim', tone: 'critical' },
  inventory: { label: 'Inventarizim', tone: 'info' },
  return: { label: 'Kthim', tone: 'low' },
}

const PAGE_SIZE = 50


export function MovementsTab({ products }: { products: Product[] }) {
  const [type, setType] = useState<MovementType | 'all'>('all')
  const [product, setProduct] = useState<Product | null>(null)
  const [page, setPage] = useState(1)
  const movements = useMovements({ type, productId: product?.id ?? null, page, pageSize: PAGE_SIZE })
  const names = useProfileNames()
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start gap-2.5 border-b border-[#EEF1EE] p-4">
        {product ? (
          <div className="flex min-h-[46px] flex-[1_1_260px] items-center justify-between gap-2 rounded-[10px] border-2 border-brand-600 bg-brand-100 px-3">
            <span className="truncate text-sm font-semibold">{product.name}</span>
            <button
              type="button"
              aria-label="Hiq filtrin e produktit"
              onClick={() => {
                setProduct(null)
                setPage(1)
              }}
              className="flex size-8 items-center justify-center rounded-md hover:bg-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <ProductPicker
            className="flex-[1_1_260px]"
            products={products}
            placeholder="Filtro sipas produktit (emri ose barkodi)"
            onPick={(p) => {
              setProduct(p)
              setPage(1)
            }}
          />
        )}
        <Select
          aria-label="Lloji"
          value={type}
          onChange={(e) => {
            setType(e.target.value as MovementType | 'all')
            setPage(1)
          }}
          options={[{ value: 'all', label: 'Të gjitha llojet' }, ...Object.entries(MOVEMENT_LABELS).map(([value, m]) => ({ value, label: m.label }))]}
          wrapperClassName="w-48"
        />
      </div>

      {movements.isPending ? (
        <div className="flex justify-center py-14">
          <LoaderCircle className="size-7 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
        </div>
      ) : movements.error ? (
        <p className="p-5 text-sm text-warn-700">{errorMessage(movements.error)}</p>
      ) : movements.data.rows.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-muted">Nuk ka lëvizje.</p>
      ) : (
        <>
          <Table shaded className={cn(movements.isFetching && 'opacity-60')}>
            <THead>
              <TR>
                <TH>Data</TH>
                <TH>Produkti</TH>
                <TH>Lloji</TH>
                <TH num>Sasia</TH>
                <TH>Shënim</TH>
                <TH>Nga</TH>
              </TR>
            </THead>
            <TBody>
              {movements.data.rows.map((m) => {
                const p = productMap.get(m.product_id)
                const d = new Date(m.created_at)
                return (
                  <TR key={m.id}>
                    <TD className="tabular-nums text-muted">
                      {formatDate(d)} {formatTime(d)}
                    </TD>
                    <TD className="font-semibold">{p?.name ?? `#${m.product_id}`}</TD>
                    <TD>
                      <Badge tone={MOVEMENT_LABELS[m.type].tone}>{MOVEMENT_LABELS[m.type].label}</Badge>
                    </TD>
                    <TD num className={cn('font-semibold', m.quantity > 0 ? 'text-brand-600' : 'text-warn-700')}>
                      {m.quantity > 0 ? '+' : '−'}
                      {formatQty(Math.abs(m.quantity))} {p ? UNIT_LABELS[p.unit] : ''}
                    </TD>
                    <TD className="max-w-[240px] truncate text-muted">
                      {m.note ?? (m.type === 'sale' && m.ref_id ? `Shitja #${m.ref_id}` : m.type === 'entry' && m.ref_id ? `Hyrja #${m.ref_id}` : '—')}
                    </TD>
                    <TD className="text-muted">{(m.created_by && names.data?.get(m.created_by)) ?? '—'}</TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={movements.data.total} onChange={setPage} className="px-4 py-3.5" />
        </>
      )}
    </Card>
  )
}
