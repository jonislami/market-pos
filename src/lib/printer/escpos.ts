import type { Charset } from './deviceSettings'

const ESC = 0x1b
const GS = 0x1d

/** ESC t n code page numbers (Epson numbering, followed by most clones). */
const CODE_PAGE: Record<Exclude<Charset, 'ascii'>, number> = { cp852: 18, cp1250: 45 }

/** Albanian (and a few common) characters that are not ASCII, per code page. */
const CHAR_MAP: Record<Exclude<Charset, 'ascii'>, Record<string, number>> = {
  cp852: { ë: 0x89, Ë: 0xd3, ç: 0x87, Ç: 0x80, é: 0x82, É: 0x90, ü: 0x81, Ü: 0x9a, ö: 0x94, Ö: 0x99 },
  cp1250: { ë: 0xeb, Ë: 0xcb, ç: 0xe7, Ç: 0xc7, é: 0xe9, É: 0xc9, ü: 0xfc, Ü: 0xdc, ö: 0xf6, Ö: 0xd6, '€': 0x80 },
}

/** Closest ASCII for anything the code page can't print: "ë" -> "e", "–" -> "-". */
function toAscii(ch: string): string {
  if (ch === '€') return 'EUR'
  if (ch === '–' || ch === '—') return '-'
  if (ch === '’' || ch === '‘') return "'"
  if (ch === '“' || ch === '”') return '"'
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return /^[\x20-\x7e]*$/.test(base) ? base : '?'
}

export type Align = 'left' | 'center' | 'right'

/** Small ESC/POS command builder; call bytes() to get the payload for the printer. */
export class EscPos {
  private out: number[] = []

  constructor(private charset: Charset) {
    this.raw(ESC, 0x40) // init
    if (charset !== 'ascii') this.raw(ESC, 0x74, CODE_PAGE[charset])
  }

  raw(...bytes: number[]) {
    this.out.push(...bytes)
    return this
  }

  text(s: string) {
    const map = this.charset === 'ascii' ? null : CHAR_MAP[this.charset]
    for (const ch of s) {
      const code = ch.charCodeAt(0)
      if (code >= 0x20 && code < 0x7f) this.out.push(code)
      else if (map && map[ch] !== undefined) this.out.push(map[ch])
      else for (const c of toAscii(ch)) this.out.push(c.charCodeAt(0))
    }
    return this
  }

  line(s = '') {
    return this.text(s).raw(0x0a)
  }

  align(a: Align) {
    return this.raw(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2)
  }

  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0)
  }

  /** Character size: 1 = normal, 2 = double. */
  size(width: 1 | 2, height: 1 | 2) {
    return this.raw(GS, 0x21, ((width - 1) << 4) | (height - 1))
  }

  feed(lines = 1) {
    return this.raw(ESC, 0x64, lines)
  }

  /** CODE128 barcode with the number printed underneath. */
  barcode(data: string) {
    const bytes = [...data].map((c) => c.charCodeAt(0))
    this.raw(GS, 0x68, 60) // height
    this.raw(GS, 0x77, 2) // module width
    this.raw(GS, 0x48, 2) // HRI below
    // GS k m=73 (CODE128) n, data prefixed with "{B" (code set B)
    return this.raw(GS, 0x6b, 73, bytes.length + 2, 0x7b, 0x42, ...bytes)
  }

  /** Partial cut after feeding past the cutter. */
  cut() {
    return this.raw(GS, 0x56, 66, 3)
  }

  /** Pulse to open the cash drawer on pin 2. */
  openDrawer() {
    return this.raw(ESC, 0x70, 0, 25, 250)
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.out)
  }
}
