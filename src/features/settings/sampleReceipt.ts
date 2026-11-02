import type { ReceiptData } from '@/lib/printer/receipt'
import type { StoreSettings } from '@/types/database'

/** Example sale for the preview and the test print (same as the design's receipt). */
export function sampleReceipt(store: StoreSettings, registerName: string, cashierName: string): ReceiptData {
  return {
    store,
    number: 487,
    date: new Date(),
    registerName,
    cashierName,
    items: [
      { name: 'Qumësht i freskët 1L', qty: 2, unitPrice: 0.95, total: 1.9, vatRate: 8 },
      { name: 'Bukë e bardhë 500g', qty: 1, unitPrice: 0.5, total: 0.5, vatRate: 8 },
      { name: 'Vaj luledielli 1L', qty: 1, unitPrice: 2.4, total: 2.4, vatRate: 8 },
      { name: 'Djathë i bardhë 400g', qty: 1, unitPrice: 3.2, total: 3.2, vatRate: 8 },
      { name: 'Ujë mineral 1.5L', qty: 6, unitPrice: 0.45, total: 2.7, vatRate: 18 },
    ],
    total: 10.7,
    payment: 'cash',
    paid: 20,
    change: 9.3,
  }
}
