import { useState } from 'react'
import { CloudOff, LoaderCircle, RefreshCw } from 'lucide-react'
import { Button, Dialog } from '@/components/ui'
import { discardOfflineSale, retryOfflineSale, syncOfflineSales, useOfflineQueue } from '@/features/pos/offlineSales'
import { formatDate, formatTime } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { useOnline } from '@/lib/offlineCache'

/** Shows when the device is offline or has sales waiting to be sent; lets a manager deal with rejected ones. */
export function OfflineBanner() {
  const online = useOnline()
  const { queue, syncing } = useOfflineQueue()
  const [open, setOpen] = useState(false)
  const failed = queue.filter((p) => p.error)
  const waiting = queue.length - failed.length

  if (online && queue.length === 0) return null

  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-[#F3D28A] bg-amber-100 px-3 py-2 text-sm text-amber-700"
      >
        {!online && (
          <span className="flex items-center gap-2 font-semibold">
            <CloudOff className="size-4" aria-hidden />
            Pa internet – arka punon, shitjet ruhen në këtë pajisje.
          </span>
        )}
        {waiting > 0 && (
          <span className="flex items-center gap-1.5">
            {syncing && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {waiting} {waiting === 1 ? 'shitje pret' : 'shitje presin'} të dërgohen
          </span>
        )}
        {failed.length > 0 && (
          <button type="button" onClick={() => setOpen(true)} className="font-semibold text-warn-700 underline">
            {failed.length} shitje u refuzuan – shiko
          </button>
        )}
        {online && waiting > 0 && !syncing && (
          <button type="button" onClick={() => void syncOfflineSales()} className="ml-auto flex items-center gap-1 font-semibold underline">
            <RefreshCw className="size-3.5" aria-hidden />
            Dërgo tani
          </button>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Shitjet offline të refuzuara">
        <p className="mb-3 text-sm text-muted">
          Këto shitje u bënë pa internet, por serveri nuk i pranoi (p.sh. produkti u çaktivizua). Rregullo shkakun dhe provo
          përsëri, ose fshije shitjen nëse nuk duhet regjistruar.
        </p>
        <ul className="flex flex-col divide-y divide-[#EEF1EE]">
          {failed.map((p) => (
            <li key={p.clientId} className="flex flex-col gap-2 py-3">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold">{p.label}</span>
                <span className="tabular-nums">{formatMoney(p.total)}</span>
              </div>
              <span className="text-xs text-muted">
                {formatDate(p.createdAt)} {formatTime(p.createdAt)} · {p.items.length} produkte · {p.payment === 'cash' ? 'Kesh' : 'Kartelë'}
              </span>
              <span className="text-xs text-warn-700">{p.error}</span>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.confirm(`Fshi shitjen ${p.label}? Nuk do të regjistrohet.`) && discardOfflineSale(p.clientId)}
                >
                  Fshi
                </Button>
                <Button size="sm" onClick={() => retryOfflineSale(p.clientId)}>
                  Provo përsëri
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  )
}
