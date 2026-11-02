import { formatDate, formatTime } from '@/lib/date'
import { formatReceiptNo, roundMoney } from '@/lib/money'
import { formatQty } from '@/lib/units'
import { VAT_CODES, vatBreakdown } from '@/lib/vat'
import type { PaymentMethod, StoreSettings, VatRate } from '@/types/database'
import type { Charset } from './deviceSettings'
import { EscPos, type Align } from './escpos'

export interface ReceiptItem {
  name: string
  qty: number
  unitPrice: number
  total: number
  vatRate: VatRate
}

export interface ReceiptData {
  store: StoreSettings
  number: number
  date: Date
  registerName: string
  cashierName: string
  items: ReceiptItem[]
  total: number
  payment: PaymentMethod
  paid: number | null
  change: number | null
  /** Marks reprints. */
  reprint?: boolean
}

/** Layout-independent receipt lines, rendered both to ESC/POS bytes and to the on-screen preview. */
export type ReceiptLine =
  | { kind: 'logo' }
  | { kind: 'text'; text: string; align?: Align; bold?: boolean; big?: boolean }
  | { kind: 'rule' }
  | { kind: 'space' }
  | { kind: 'barcode'; data: string }

/** Characters per line: 58mm = 32, 80mm = 48. */
export function charsPerLine(paperWidth: 58 | 80): number {
  return paperWidth === 58 ? 32 : 48
}

const m = (n: number) => n.toFixed(2)

/** Left and right text on one line, padded to the width; the left side is cut if needed. */
function pair(left: string, right: string, width: number): string {
  const space = width - right.length - 1
  const l = left.length > space ? left.slice(0, Math.max(space, 0)) : left
  return l + ' '.repeat(Math.max(width - l.length - right.length, 1)) + right
}

/** Word-wraps a product name to the line width. */
function wrap(text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (!line) line = word
    else if ((line + ' ' + word).length <= width) line += ' ' + word
    else {
      out.push(line)
      line = word
    }
    while (line.length > width) {
      out.push(line.slice(0, width))
      line = line.slice(width)
    }
  }
  if (line) out.push(line)
  return out
}

/** Three columns: left-aligned label, then two right-aligned amounts. */
function cols(a: string, b: string, c: string, width: number): string {
  const cw = Math.floor((width - 10) / 2)
  return a.padEnd(10).slice(0, 10) + b.padStart(cw) + c.padStart(width - 10 - cw)
}

export function buildReceiptLines(d: ReceiptData): ReceiptLine[] {
  const w = charsPerLine(d.store.paper_width)
  const s = d.store
  const lines: ReceiptLine[] = []
  const rule = () => lines.push({ kind: 'rule' })

  if (s.show_logo) lines.push({ kind: 'logo' })
  lines.push({ kind: 'text', text: s.store_name.toUpperCase(), align: 'center', bold: true })
  if (s.address) lines.push({ kind: 'text', text: s.address, align: 'center' })
  if (s.phone) lines.push({ kind: 'text', text: `Tel: ${s.phone}`, align: 'center' })
  if (s.nui) lines.push({ kind: 'text', text: `NUI: ${s.nui}`, align: 'center' })
  if (d.reprint) lines.push({ kind: 'text', text: '*** KOPJE ***', align: 'center', bold: true })
  rule()

  lines.push({ kind: 'text', text: pair('Fatura:', formatReceiptNo(d.number), w), bold: true })
  lines.push({ kind: 'text', text: pair('Data:', `${formatDate(d.date)} ${formatTime(d.date)}`, w) })
  lines.push({ kind: 'text', text: pair('Arka:', d.registerName, w) })
  lines.push({ kind: 'text', text: pair('Arkëtari:', d.cashierName, w) })
  rule()

  for (const it of d.items) {
    for (const l of wrap(it.name, w)) lines.push({ kind: 'text', text: l })
    lines.push({ kind: 'text', text: pair(`${formatQty(it.qty)} x ${m(it.unitPrice)}`, `${m(it.total)} ${VAT_CODES[it.vatRate]}`, w) })
  }
  rule()

  lines.push({ kind: 'text', text: pair('TOTALI EUR', m(d.total), w), bold: true, big: true })
  lines.push({ kind: 'space' })
  if (d.payment === 'cash') {
    lines.push({ kind: 'text', text: pair('Kesh', m(d.paid ?? d.total), w) })
    lines.push({ kind: 'text', text: pair('Kusuri', m(d.change ?? 0), w), bold: true })
  } else {
    lines.push({ kind: 'text', text: pair('Kartelë', m(d.total), w) })
  }

  if (s.show_vat_breakdown) {
    rule()
    const rows = vatBreakdown(d.items.map((i) => ({ vatRate: i.vatRate, total: i.total })))
    lines.push({ kind: 'text', text: cols('TVSH', 'Baza', 'Tvsh', w), bold: true })
    for (const r of rows) lines.push({ kind: 'text', text: cols(`${r.code} ${r.rate}%`, m(r.base), m(r.vat), w) })
    const base = roundMoney(rows.reduce((a, r) => a + r.base, 0))
    const vat = roundMoney(rows.reduce((a, r) => a + r.vat, 0))
    lines.push({ kind: 'text', text: cols('Gjithsej', m(base), m(vat), w) })
  }

  rule()
  if (s.receipt_footer) lines.push({ kind: 'text', text: s.receipt_footer, align: 'center', bold: true })
  lines.push({ kind: 'text', text: 'Kupon jo-fiskal', align: 'center' })
  if (s.show_barcode !== false) lines.push({ kind: 'barcode', data: String(d.number).padStart(5, '0') })
  return lines
}

/** ESC/POS bytes for one copy, including the cut (and the drawer pulse when asked). */
export function receiptToEscPos(d: ReceiptData, charset: Charset, openDrawer: boolean): Uint8Array {
  const w = charsPerLine(d.store.paper_width)
  const p = new EscPos(charset)
  for (const l of buildReceiptLines(d)) {
    switch (l.kind) {
      case 'logo':
        break // thermal logos need a raster image; the store name stands in for it
      case 'rule':
        p.align('left').line('-'.repeat(w))
        break
      case 'space':
        p.line()
        break
      case 'barcode':
        p.align('center').barcode(l.data).line()
        break
      case 'text':
        p.align(l.align ?? 'left').bold(Boolean(l.bold))
        // Double height keeps the width, so padded "pair" lines still fit.
        if (l.big) p.size(1, 2)
        p.line(l.text)
        if (l.big) p.size(1, 1)
        if (l.bold) p.bold(false)
    }
  }
  p.align('left').feed(4).cut()
  if (openDrawer) p.openDrawer()
  return p.bytes()
}
