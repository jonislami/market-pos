import { forwardRef } from 'react'
import { CircleCheck } from 'lucide-react'
import { Button, Dialog } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatMoney, formatReceiptNo, roundMoney } from '@/lib/money'
import { parseDecimal } from '@/lib/text'
import type { PaymentMethod, Sale } from '@/types/database'

export interface PaymentState {
  method: PaymentMethod
  /** Cash handed over, as typed; empty means the exact amount. */
  paidText: string
}

export interface CashInfo {
  paid: number | null
  change: number
  /** Positive when the customer gave less than the total. */
  missing: number
}

export function cashInfo(total: number, paidText: string): CashInfo {
  const paid = parseDecimal(paidText)
  if (paid === null) return { paid: null, change: 0, missing: 0 }
  const diff = roundMoney(paid - total)
  return { paid, change: Math.max(0, diff), missing: Math.max(0, -diff) }
}

/** Exact amount plus the next round notes above it: 10.70 -> 10.70, 15, 20, 50. */
export function quickAmounts(total: number): number[] {
  const out = new Set<number>([roundMoney(total)])
  for (const note of [5, 10, 20, 50, 100]) {
    const v = Math.ceil(total / note) * note
    if (v > total) out.add(v)
    if (out.size >= 4) break
  }
  return [...out]
}

export function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn('rounded-md border px-1.5 py-0.5 text-xs font-medium opacity-80', className)}>{children}</span>
  )
}

function MethodToggle({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const btn = (m: PaymentMethod, label: string) => (
    <button
      type="button"
      aria-pressed={value === m}
      onClick={() => onChange(m)}
      className={cn(
        'min-h-12 flex-1 rounded-[10px] text-sm font-semibold',
        value === m ? 'border-2 border-brand-600 bg-brand-100 text-[#0F2A1F]' : 'border border-field bg-white text-ink hover:bg-[#F0F3F1]',
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="flex gap-2">
      {btn('cash', 'Kesh')}
      {btn('card', 'Kartelë')}
    </div>
  )
}

interface CashFieldsProps {
  total: number
  paidText: string
  onPaidText: (v: string) => void
  onEnter: () => void
  large?: boolean
}

export const CashFields = forwardRef<HTMLInputElement, CashFieldsProps>(function CashFields(
  { total, paidText, onPaidText, onEnter, large },
  ref,
) {
  const info = cashInfo(total, paidText)
  return (
    <div className="flex gap-2">
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
        Paguar
        <input
          ref={ref}
          inputMode="decimal"
          placeholder={formatMoney(total)}
          value={paidText}
          onChange={(e) => onPaidText(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => e.key === 'Enter' && onEnter()}
          className={cn(
            'min-h-btn w-full rounded-[10px] border border-field bg-white px-3 font-semibold tabular-nums text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20',
            large ? 'min-h-[56px] text-2xl' : 'text-lg',
          )}
        />
      </label>
      <div className="flex flex-col items-end gap-1 text-xs text-muted">
        {info.missing > 0 ? 'Mungojnë' : 'Kusuri'}
        <span
          className={cn(
            'flex min-h-btn items-center rounded-[10px] px-3 font-bold tabular-nums',
            large ? 'min-h-[56px] text-2xl' : 'text-lg',
            info.missing > 0 ? 'bg-warn-100 text-warn-700' : info.change > 0 ? 'bg-[#FFEDE0] text-warn-700' : 'bg-[#F0F3F1] text-muted',
          )}
        >
          {formatMoney(info.missing > 0 ? info.missing : info.change)}
        </span>
      </div>
    </div>
  )
})

interface PanelProps {
  total: number
  state: PaymentState
  onState: (s: PaymentState) => void
  onPay: () => void
  canPay: boolean
  pending: boolean
  paidRef: React.Ref<HTMLInputElement>
}

/** Desktop payment block under the cart. */
export function PaymentPanel({ total, state, onState, onPay, canPay, pending, paidRef }: PanelProps) {
  const short = state.method === 'cash' && cashInfo(total, state.paidText).missing > 0
  return (
    <div className="flex flex-col gap-3">
      <MethodToggle value={state.method} onChange={(method) => onState({ ...state, method })} />
      {state.method === 'cash' && (
        <CashFields ref={paidRef} total={total} paidText={state.paidText} onPaidText={(paidText) => onState({ ...state, paidText })} onEnter={onPay} />
      )}
      <Button size="lg" className="min-h-[60px] text-lg" disabled={!canPay || short} loading={pending} onClick={onPay}>
        Paguaj {formatMoney(total)}
        <Kbd className="border-white/50">F12</Kbd>
      </Button>
    </div>
  )
}

interface DialogProps {
  open: boolean
  onClose: () => void
  total: number
  state: PaymentState
  onState: (s: PaymentState) => void
  onPay: () => void
  pending: boolean
  error: string | null
}

/** Phone: payment sheet opened from the bottom bar. */
export function PaymentDialog({ open, onClose, total, state, onState, onPay, pending, error }: DialogProps) {
  const short = state.method === 'cash' && cashInfo(total, state.paidText).missing > 0
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={state.method === 'cash' ? 'Pagesa me kesh' : 'Pagesa me kartelë'}
      size="sm"
      footer={
        <Button size="lg" block disabled={short} loading={pending} onClick={onPay}>
          Paguaj {formatMoney(total)}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Totali</span>
          <span className="text-[32px] font-bold tabular-nums">{formatMoney(total)}</span>
        </div>
        {state.method === 'cash' && (
          <>
            <CashFields large total={total} paidText={state.paidText} onPaidText={(paidText) => onState({ ...state, paidText })} onEnter={onPay} />
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts(total).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => onState({ ...state, paidText: a.toFixed(2) })}
                  className="min-h-btn rounded-[10px] border border-field bg-white text-sm font-semibold tabular-nums"
                >
                  {formatMoney(a)}
                </button>
              ))}
            </div>
          </>
        )}
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm font-medium text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}

export type PrintStatus = { state: 'idle' | 'printing' | 'done' } | { state: 'error'; message: string }

/** Confirmation after create_sale succeeded; Enter starts the next sale. */
export function SaleDoneDialog({
  sale,
  onClose,
  onPrint,
  printStatus,
}: {
  sale: Sale | null
  onClose: () => void
  onPrint?: () => void
  printStatus: PrintStatus
}) {
  return (
    <Dialog
      open={sale !== null}
      onClose={onClose}
      title="Shitja u krye"
      size="sm"
      footer={
        <>
          {onPrint && (
            <Button variant="secondary" size="lg" className="flex-1" loading={printStatus.state === 'printing'} onClick={onPrint}>
              {printStatus.state === 'done' ? 'Printo kopje' : 'Printo'}
            </Button>
          )}
          <Button size="lg" className="flex-[2]" autoFocus onClick={onClose}>
            Shitje e re
          </Button>
        </>
      }
    >
      {sale && (
        <div className="flex flex-col items-center gap-4 text-center">
          <CircleCheck className="size-12 text-brand-600" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted">Fatura {formatReceiptNo(sale.number)}</span>
            <span className="text-2xl font-bold tabular-nums">{formatMoney(sale.total)}</span>
            <span className="text-sm text-muted">{sale.payment_method === 'cash' ? 'Kesh' : 'Kartelë'}</span>
          </div>
          {sale.payment_method === 'cash' && (sale.change ?? 0) > 0 && (
            <div className="w-full rounded-card bg-warn-100 p-4">
              <span className="block text-sm text-warn-700">Kusuri për klientin</span>
              <span className="text-[40px] font-bold leading-tight tabular-nums text-warn-700">{formatMoney(sale.change ?? 0)}</span>
              <span className="block text-xs text-warn-700">Paguar {formatMoney(sale.paid ?? sale.total)}</span>
            </div>
          )}
          {printStatus.state === 'printing' && <p className="text-sm text-muted">Duke printuar faturën…</p>}
          {printStatus.state === 'done' && <p className="text-sm text-brand-600">Fatura u printua.</p>}
          {printStatus.state === 'error' && (
            <p className="w-full rounded-[10px] bg-warn-100 px-3 py-2 text-sm text-warn-700">
              Fatura nuk u printua: {printStatus.message}
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}
