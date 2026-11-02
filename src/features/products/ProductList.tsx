import { Badge, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { STOCK_BADGE, stockStatus } from '@/lib/stock'
import { formatPercent } from '@/lib/text'
import { formatQty, UNIT_LABELS } from '@/lib/units'
import { margin } from '@/lib/vat'
import type { Product } from '@/types/database'

interface Props {
  products: Product[]
  categoryName: (id: number | null) => string
  selectedId: number | null
  onSelect: (product: Product) => void
}

function MarginText({ p }: { p: Product }) {
  const m = margin(p.sale_price, p.cost_price)
  if (m === null) return <>—</>
  return <span className={cn(m < 0 && 'font-semibold text-warn-700')}>{formatPercent(m)}</span>
}

/** Stock number, highlighted as a badge when low or critical. */
function StockValue({ p, withUnit }: { p: Product; withUnit?: boolean }) {
  const text = withUnit ? `${formatQty(p.stock)} ${UNIT_LABELS[p.unit]}` : formatQty(p.stock)
  const status = stockStatus(p.stock, p.min_stock)
  if (status === 'ok') return <span className="tabular-nums">{text}</span>
  return (
    <Badge tone={STOCK_BADGE[status].tone} title={STOCK_BADGE[status].label} className="text-[13px] tabular-nums">
      {text}
    </Badge>
  )
}

export function ProductTable({ products, categoryName, selectedId, onSelect }: Props) {
  return (
    <Table shaded className="hidden md:table">
      <THead>
        <TR>
          <TH>Barkodi</TH>
          <TH>Produkti</TH>
          <TH>Kategoria</TH>
          <TH>Njësia</TH>
          <TH num>Ç. blerjes</TH>
          <TH num>Ç. shitjes</TH>
          <TH num>Marzha</TH>
          <TH num>TVSH</TH>
          <TH num>Stoku</TH>
          <TH>
            <span className="sr-only">Veprime</span>
          </TH>
        </TR>
      </THead>
      <TBody>
        {products.map((p) => (
          <TR
            key={p.id}
            onClick={() => onSelect(p)}
            className={cn('cursor-pointer', selectedId === p.id && '!bg-brand-100')}
          >
            <TD className="tabular-nums text-muted">{p.barcode ?? '—'}</TD>
            <TD className="font-semibold">
              {p.name}
              {!p.active && (
                <Badge className="ml-2" tone="neutral">
                  Joaktiv
                </Badge>
              )}
            </TD>
            <TD>{categoryName(p.category_id)}</TD>
            <TD>{UNIT_LABELS[p.unit]}</TD>
            <TD num>{formatMoney(p.cost_price)}</TD>
            <TD num className="font-semibold">
              {formatMoney(p.sale_price)}
            </TD>
            <TD num>
              <MarginText p={p} />
            </TD>
            <TD num>{p.vat_rate}%</TD>
            <TD num>
              <StockValue p={p} />
            </TD>
            <TD>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(p)
                }}
                className="text-[13px] font-semibold text-brand-600 hover:underline"
              >
                Ndrysho
              </button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

export function ProductCards({ products, categoryName, onSelect }: Props) {
  return (
    <ul className="flex flex-col gap-2.5 md:hidden">
      {products.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-white px-4 py-3.5 text-left"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-base font-semibold">{p.name}</span>
              <span className="truncate text-[13px] text-muted">
                {categoryName(p.category_id)} · Marzha <MarginText p={p} />
                {!p.active && ' · Joaktiv'}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-base font-bold tabular-nums">{formatMoney(p.sale_price)}</span>
              <span className="text-[13px] text-muted">
                <StockValue p={p} withUnit />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
