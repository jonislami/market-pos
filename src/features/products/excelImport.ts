import { supabase } from '@/lib/supabase'
import { normalizeText, parseDecimal } from '@/lib/text'
import { allowsDecimals } from '@/lib/units'
import type { Category, Product, ProductInput, Unit, VatRate } from '@/types/database'

type Cell = unknown

type Field = 'barcode' | 'name' | 'category' | 'unit' | 'cost' | 'sale' | 'vat' | 'minStock' | 'stock'

/** Column titles accepted for each field (compared without diacritics, case-insensitive). */
const FIELD_ALIASES: Record<Field, string[]> = {
  barcode: ['barkodi', 'barkod', 'barcode', 'ean', 'kodi'],
  name: ['emri', 'emri i produktit', 'produkti', 'emertimi', 'name', 'artikulli'],
  category: ['kategoria', 'category', 'grupi'],
  unit: ['njesia', 'njesi', 'unit', 'njm'],
  cost: ['cmimi i blerjes', 'c. blerjes', 'c.blerjes', 'cmimi blerjes', 'blerja', 'cost'],
  sale: ['cmimi i shitjes', 'c. shitjes', 'c.shitjes', 'cmimi shitjes', 'shitja', 'cmimi', 'price'],
  vat: ['tvsh', 'tvsh %', 'tvsh (%)', 'vat'],
  minStock: ['stoku minimal', 'stok minimal', 'min stok', 'minimumi', 'min_stock'],
  stock: ['stoku', 'stoku fillestar', 'sasia', 'stock'],
}

/** Header row of the downloadable template, in the order shown to the user. */
export const TEMPLATE_HEADERS = [
  'Barkodi',
  'Emri i produktit',
  'Kategoria',
  'Njësia',
  'Çmimi i blerjes',
  'Çmimi i shitjes',
  'TVSH',
  'Stoku minimal',
  'Stoku fillestar',
]

export const TEMPLATE_SAMPLE: (string | number)[][] = [
  ['3870001000124', 'Qumësht i freskët 1L', 'Bulmet', 'copë', 0.72, 0.95, 8, 24, 64],
  ['', 'Domate', 'Pemë & Perime', 'kg', 0.85, 1.2, 8, 10, 18.5],
]

export interface ImportRow {
  /** Spreadsheet row number (1-based, as Excel shows it). */
  line: number
  action: 'create' | 'update'
  existingId?: number
  name: string
  barcode: string | null
  categoryName: string | null
  input: Omit<ProductInput, 'category_id'> | null
  /** Initial stock; applied only to newly created products. */
  initialStock: number | null
  errors: string[]
  warnings: string[]
}

export interface ParsedImport {
  rows: ImportRow[]
  /** Columns found in the file, for the preview. */
  detected: Field[]
  missingRequired: string[]
}

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return ''
  // Barcodes often arrive as numbers; 13 digits are still exact in a double.
  if (typeof cell === 'number') return String(cell)
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  return String(cell).trim()
}

function cellNumber(cell: Cell): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  return parseDecimal(cellText(cell))
}

function parseUnit(text: string): Unit | null {
  const t = normalizeText(text).replace(/\.$/, '')
  if (!t) return null
  if (['cope', 'cop', 'copa', 'pcs', 'pc'].includes(t)) return 'cope'
  if (['kg', 'kilogram'].includes(t)) return 'kg'
  if (['pako', 'pak', 'paketa', 'pack'].includes(t)) return 'pako'
  if (['liter', 'litra', 'l', 'lit', 'litre'].includes(t)) return 'liter'
  return null
}

function parseVat(cell: Cell): VatRate | null {
  const text = normalizeText(cellText(cell))
  if (text === 'a') return 18
  if (text === 'b') return 8
  let n = cellNumber(String(cellText(cell)).replace('%', ''))
  if (n === null) return null
  if (n > 0 && n < 1) n = Math.round(n * 100) // 0.08 from a percentage-formatted cell
  return n === 0 || n === 8 || n === 18 ? n : null
}

function mapHeader(header: Cell[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {}
  header.forEach((cell, index) => {
    const title = normalizeText(cellText(cell)).replace(/\s+/g, ' ')
    for (const field of Object.keys(FIELD_ALIASES) as Field[]) {
      if (map[field] === undefined && FIELD_ALIASES[field].includes(title)) map[field] = index
    }
  })
  return map
}

/** Validates spreadsheet rows against the current catalogue; nothing is written. */
export function parseImport(sheet: Cell[][], products: Product[]): ParsedImport {
  const headerIndex = sheet.findIndex((row) => row.some((c) => cellText(c) !== ''))
  if (headerIndex < 0) return { rows: [], detected: [], missingRequired: ['Emri i produktit', 'Çmimi i shitjes'] }

  const cols = mapHeader(sheet[headerIndex])
  const detected = (Object.keys(cols) as Field[]).sort(
    (a, b) => (cols[a] ?? 0) - (cols[b] ?? 0),
  )
  const missingRequired: string[] = []
  if (cols.name === undefined) missingRequired.push('Emri i produktit')
  if (cols.sale === undefined) missingRequired.push('Çmimi i shitjes')
  if (missingRequired.length) return { rows: [], detected, missingRequired }

  const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode!, p]))
  const byName = new Map<string, Product[]>()
  for (const p of products) {
    const key = normalizeText(p.name)
    byName.set(key, [...(byName.get(key) ?? []), p])
  }
  const seenBarcodes = new Set<string>()

  const get = (row: Cell[], field: Field): Cell => (cols[field] === undefined ? null : row[cols[field]!])
  const has = (row: Cell[], field: Field) => cols[field] !== undefined && cellText(get(row, field)) !== ''

  const rows: ImportRow[] = []
  sheet.slice(headerIndex + 1).forEach((row, i) => {
    if (row.every((c) => cellText(c) === '')) return
    const line = headerIndex + i + 2
    const errors: string[] = []
    const warnings: string[] = []

    const name = cellText(get(row, 'name'))
    const barcode = cellText(get(row, 'barcode')) || null
    if (!name) errors.push('Mungon emri')

    if (barcode) {
      if (seenBarcodes.has(barcode)) errors.push('Barkodi përsëritet në skedar')
      seenBarcodes.add(barcode)
    }

    // Match an existing product by barcode, or by a unique exact name when there is no barcode.
    let existing = barcode ? byBarcode.get(barcode) : undefined
    if (!existing && !barcode && name) {
      const sameName = byName.get(normalizeText(name)) ?? []
      if (sameName.length === 1) existing = sameName[0]
    }

    const unitText = cellText(get(row, 'unit'))
    const unit = unitText ? parseUnit(unitText) : (existing?.unit ?? 'cope')
    if (!unit) errors.push(`Njësi e panjohur "${unitText}"`)

    const sale = has(row, 'sale') ? cellNumber(get(row, 'sale')) : (existing?.sale_price ?? null)
    if (sale === null) errors.push(has(row, 'sale') ? 'Çmimi i shitjes i pavlefshëm' : 'Mungon çmimi i shitjes')
    else if (sale <= 0) errors.push('Çmimi i shitjes duhet të jetë > 0')

    const cost = has(row, 'cost') ? cellNumber(get(row, 'cost')) : (existing?.cost_price ?? 0)
    if (cost === null || cost < 0) errors.push('Çmimi i blerjes i pavlefshëm')

    const vat = has(row, 'vat') ? parseVat(get(row, 'vat')) : (existing?.vat_rate ?? 8)
    if (vat === null) errors.push('TVSH duhet të jetë 0, 8 ose 18')

    const minStock = has(row, 'minStock') ? cellNumber(get(row, 'minStock')) : (existing?.min_stock ?? 0)
    if (minStock === null || minStock < 0) errors.push('Stoku minimal i pavlefshëm')
    else if (unit && !allowsDecimals(unit) && !Number.isInteger(minStock)) errors.push('Stoku minimal duhet numër i plotë')

    let initialStock: number | null = null
    if (has(row, 'stock')) {
      const s = cellNumber(get(row, 'stock'))
      if (existing) warnings.push('Stoku nuk ndryshohet për produktet ekzistuese')
      else if (s === null || s < 0) errors.push('Stoku fillestar i pavlefshëm')
      else if (unit && !allowsDecimals(unit) && !Number.isInteger(s)) errors.push('Stoku duhet numër i plotë')
      else if (s > 0) initialStock = s
    }

    if (sale !== null && cost !== null && cost > sale) warnings.push('Çmimi i blerjes më i lartë se i shitjes')

    const categoryName = has(row, 'category') ? cellText(get(row, 'category')) : null

    rows.push({
      line,
      action: existing ? 'update' : 'create',
      existingId: existing?.id,
      name,
      barcode: barcode ?? existing?.barcode ?? null,
      categoryName,
      initialStock,
      errors,
      warnings,
      input:
        errors.length === 0
          ? {
              name,
              barcode: barcode ?? existing?.barcode ?? null,
              unit: unit!,
              cost_price: Math.round(cost! * 100) / 100,
              sale_price: Math.round(sale! * 100) / 100,
              vat_rate: vat!,
              min_stock: minStock!,
              show_in_pos: existing?.show_in_pos ?? true,
              active: existing?.active ?? true,
            }
          : null,
    })
  })

  return { rows, detected, missingRequired }
}

export interface ImportResult {
  created: number
  updated: number
  categoriesCreated: number
  stockSet: number
  stockFailed: number
}

const CHUNK = 500

/** Writes the valid rows: creates missing categories, updates/creates products, sets initial stock. */
export async function runImport(
  rows: ImportRow[],
  products: Product[],
  categories: Category[],
  onProgress: (message: string) => void,
): Promise<ImportResult> {
  const valid = rows.filter((r) => r.input)
  const result: ImportResult = { created: 0, updated: 0, categoriesCreated: 0, stockSet: 0, stockFailed: 0 }

  // 1. Categories
  const categoryIds = new Map(categories.map((c) => [normalizeText(c.name), c.id]))
  const newNames = new Map<string, string>()
  for (const r of valid) {
    if (r.categoryName && !categoryIds.has(normalizeText(r.categoryName))) newNames.set(normalizeText(r.categoryName), r.categoryName)
  }
  if (newNames.size) {
    onProgress(`Duke krijuar ${newNames.size} kategori…`)
    const { data, error } = await supabase
      .from('categories')
      .insert([...newNames.values()].map((name) => ({ name })))
      .select('id, name')
    if (error) throw error
    for (const c of data) categoryIds.set(normalizeText(c.name), c.id)
    result.categoriesCreated = data.length
  }

  const existingById = new Map(products.map((p) => [p.id, p]))
  const categoryFor = (r: ImportRow): number | null =>
    r.categoryName === null
      ? (r.existingId ? (existingById.get(r.existingId)?.category_id ?? null) : null)
      : (categoryIds.get(normalizeText(r.categoryName)) ?? null)

  // 2. Updates (upsert on id; stock is not part of the payload, so it is left untouched)
  const updates = valid.filter((r) => r.action === 'update')
  const now = new Date().toISOString()
  for (let i = 0; i < updates.length; i += CHUNK) {
    onProgress(`Duke përditësuar produktet ${i + 1}–${Math.min(i + CHUNK, updates.length)} nga ${updates.length}…`)
    const payload = updates.slice(i, i + CHUNK).map((r) => ({ id: r.existingId!, ...r.input!, category_id: categoryFor(r), updated_at: now }))
    const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' })
    if (error) throw error
    result.updated += payload.length
  }

  // 3. Creates
  const creates = valid.filter((r) => r.action === 'create')
  const stockQueue: { id: number; qty: number }[] = []
  for (let i = 0; i < creates.length; i += CHUNK) {
    onProgress(`Duke shtuar produktet ${i + 1}–${Math.min(i + CHUNK, creates.length)} nga ${creates.length}…`)
    const chunk = creates.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('products')
      .insert(chunk.map((r) => ({ ...r.input!, category_id: categoryFor(r) })))
      .select('id')
    if (error) throw error
    // RETURNING keeps the VALUES order, so ids line up with the chunk.
    data.forEach((row, j) => {
      const qty = chunk[j].initialStock
      if (qty) stockQueue.push({ id: row.id, qty })
    })
    result.created += data.length
  }

  // 4. Initial stock goes through adjust_stock so it is recorded in stock_movements.
  let done = 0
  const worker = async () => {
    for (let item = stockQueue.shift(); item; item = stockQueue.shift()) {
      const { error } = await supabase.rpc('adjust_stock', {
        p_product_id: item.id,
        p_quantity: item.qty,
        p_type: 'inventory',
        p_note: 'Stoku fillestar (import nga Excel)',
      })
      if (error) result.stockFailed++
      else result.stockSet++
      done++
      if (done % 10 === 0) onProgress(`Duke vendosur stokun fillestar (${done})…`)
    }
  }
  if (stockQueue.length) {
    onProgress('Duke vendosur stokun fillestar…')
    await Promise.all(Array.from({ length: 6 }, worker))
  }

  return result
}
