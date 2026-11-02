import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ReceiptView } from '@/components/ReceiptView'
import { bluetoothSupported, writeToPrinter } from './bluetooth'
import { getDeviceSettings } from './deviceSettings'
import { receiptToEscPos, type ReceiptData } from './receipt'

// ---------- Browser print fallback (iPhone/Safari, or no Bluetooth printer set up) ----------

let job: ReceiptData | null = null
const listeners = new Set<() => void>()

function setJob(next: ReceiptData | null) {
  job = next
  listeners.forEach((l) => l())
}

/** Mount once (in the app root): renders the receipt being printed into a print-only container. */
export function PrintArea() {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => job,
  )
  if (!current) return null
  const w = current.store.paper_width
  return createPortal(
    <div id="print-area">
      <style>{`@page { size: ${w}mm auto; margin: 0; }`}</style>
      <ReceiptView data={current} className="mx-auto [font-size:2.5mm]" />
    </div>,
    document.body,
  )
}

function printWithBrowser(data: ReceiptData): Promise<void> {
  return new Promise((resolve) => {
    setJob(data)
    // Let React paint the receipt before the print dialog snapshots the page.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const done = () => {
          window.removeEventListener('afterprint', done)
          setJob(null)
          resolve()
        }
        window.addEventListener('afterprint', done)
        window.print()
        // Some mobile browsers never fire afterprint.
        window.setTimeout(done, 60_000)
      }),
    )
  })
}

// ---------- Public API ----------

export type PrintMethod = 'bluetooth' | 'browser'

/** Bluetooth when a printer has been paired on this device, otherwise the browser print dialog. */
export function preferredPrintMethod(): PrintMethod {
  return bluetoothSupported && getDeviceSettings().lastDeviceId ? 'bluetooth' : 'browser'
}

export interface PrintOptions {
  copies?: number
  openDrawer?: boolean
  method?: PrintMethod
}

export async function printReceipt(data: ReceiptData, opts: PrintOptions = {}): Promise<PrintMethod> {
  const method = opts.method ?? preferredPrintMethod()
  const copies = Math.min(Math.max(opts.copies ?? 1, 1), 3)
  if (method === 'browser') {
    await printWithBrowser(data)
    return method
  }
  const { charset } = getDeviceSettings()
  for (let i = 0; i < copies; i++) {
    // Open the drawer once, with the first copy; later copies are marked as copies.
    await writeToPrinter(receiptToEscPos(i === 0 ? data : { ...data, reprint: true }, charset, i === 0 && Boolean(opts.openDrawer)))
  }
  return method
}
