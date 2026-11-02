import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Download, FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { Badge, Button, Dialog, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import type { Category, Product } from '@/types/database'
import { productKeys } from './api'
import {
  parseImport,
  runImport,
  TEMPLATE_HEADERS,
  TEMPLATE_SAMPLE,
  type ImportResult,
  type ParsedImport,
} from './excelImport'

interface Props {
  open: boolean
  onClose: () => void
  products: Product[]
  categories: Category[]
}

type Step = { kind: 'pick' } | { kind: 'preview'; fileName: string; parsed: ParsedImport } | { kind: 'running'; message: string } | { kind: 'done'; result: ImportResult }

const PREVIEW_LIMIT = 300

async function downloadTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const header = TEMPLATE_HEADERS.map((value) => ({ value, fontWeight: 'bold' as const }))
  const rows = TEMPLATE_SAMPLE.map((r) => r.map((value) => ({ value })))
  await writeXlsxFile([header, ...rows], { columns: TEMPLATE_HEADERS.map((h) => ({ width: Math.max(12, h.length + 4) })) }).toFile(
    'shablloni-produktet.xlsx',
  )
}

export function ImportDialog({ open, onClose, products, categories }: Props) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  function close() {
    if (step.kind === 'running') return
    setStep({ kind: 'pick' })
    setError(null)
    onClose()
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setReading(true)
    try {
      const { readSheet } = await import('read-excel-file/browser')
      const sheet = await readSheet(file)
      const parsed = parseImport(sheet, products)
      if (parsed.missingRequired.length) {
        setError(`Skedarit i mungojnë kolonat: ${parsed.missingRequired.join(', ')}. Përdor shabllonin.`)
      } else if (parsed.rows.length === 0) {
        setError('Skedari nuk ka asnjë rresht me produkte.')
      } else {
        setStep({ kind: 'preview', fileName: file.name, parsed })
      }
    } catch (err) {
      console.error(err)
      setError('Skedari nuk u lexua. Sigurohu që është .xlsx (Excel).')
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onImport(parsed: ParsedImport) {
    setError(null)
    setStep({ kind: 'running', message: 'Duke filluar…' })
    try {
      const result = await runImport(parsed.rows, products, categories, (message) => setStep({ kind: 'running', message }))
      setStep({ kind: 'done', result })
    } catch (err) {
      // Some rows may already be saved, so re-read the file against the refreshed catalogue.
      setError(`${errorMessage(err)} Disa produkte mund të jenë ruajtur; ngarko skedarin përsëri.`)
      setStep({ kind: 'pick' })
    } finally {
      // Even a partial import may have written rows.
      void qc.invalidateQueries({ queryKey: productKeys.all })
      void qc.invalidateQueries({ queryKey: productKeys.categories })
    }
  }

  let body
  let footer
  if (step.kind === 'pick') {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Ngarko një skedar Excel (.xlsx) me kolonat: <strong className="text-ink">Emri i produktit</strong> dhe{' '}
          <strong className="text-ink">Çmimi i shitjes</strong> (të detyrueshme), si dhe Barkodi, Kategoria, Njësia, Çmimi i
          blerjes, TVSH, Stoku minimal, Stoku fillestar.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
          <li>Produktet me barkod që ekziston përditësohen; të tjerat shtohen si të reja.</li>
          <li>Kategoritë që mungojnë krijohen automatikisht.</li>
          <li>Stoku fillestar vendoset vetëm për produktet e reja dhe regjistrohet si inventarizim.</li>
        </ul>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={reading}
          className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-field bg-bg text-sm font-semibold text-brand-600 hover:border-brand-600"
        >
          {reading ? <LoaderCircle className="size-8 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-8" aria-hidden />}
          {reading ? 'Duke lexuar…' : 'Zgjidh skedarin Excel'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
    )
    footer = (
      <Button variant="secondary" icon={<Download className="size-4" aria-hidden />} onClick={() => void downloadTemplate()}>
        Shkarko shabllonin
      </Button>
    )
  } else if (step.kind === 'preview') {
    const { rows } = step.parsed
    const valid = rows.filter((r) => r.input)
    const creates = valid.filter((r) => r.action === 'create').length
    const updates = valid.length - creates
    const invalid = rows.length - valid.length
    body = (
      <div className="flex flex-col gap-4">
        {step.fileName && <p className="text-sm text-muted">{step.fileName}</p>}
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">{creates} të reja</Badge>
          <Badge tone="info">{updates} përditësime</Badge>
          {invalid > 0 && <Badge tone="critical">{invalid} me gabime (anashkalohen)</Badge>}
        </div>
        <div className="rounded-card border border-line">
          <Table shaded>
            <THead>
              <TR>
                <TH>Rr.</TH>
                <TH>Veprimi</TH>
                <TH>Produkti</TH>
                <TH>Barkodi</TH>
                <TH>Kategoria</TH>
                <TH num>Ç. shitjes</TH>
                <TH>Shënime</TH>
              </TR>
            </THead>
            <TBody>
              {rows.slice(0, PREVIEW_LIMIT).map((r) => (
                <TR key={r.line} className={cn(!r.input && 'bg-warn-100/50')}>
                  <TD className="text-muted">{r.line}</TD>
                  <TD>
                    {!r.input ? (
                      <Badge tone="critical">Gabim</Badge>
                    ) : r.action === 'create' ? (
                      <Badge tone="success">E re</Badge>
                    ) : (
                      <Badge tone="info">Përditësim</Badge>
                    )}
                  </TD>
                  <TD className="font-semibold">{r.name || '—'}</TD>
                  <TD className="tabular-nums text-muted">{r.barcode ?? '—'}</TD>
                  <TD>{r.categoryName ?? '—'}</TD>
                  <TD num>{r.input ? formatMoney(r.input.sale_price) : '—'}</TD>
                  <TD className="whitespace-normal text-xs">
                    {r.errors.length > 0 && <span className="text-warn-700">{r.errors.join(' · ')}</span>}
                    {r.warnings.length > 0 && <span className="text-amber-700">{r.warnings.join(' · ')}</span>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        {rows.length > PREVIEW_LIMIT && (
          <p className="text-xs text-muted">Shfaqen {PREVIEW_LIMIT} rreshtat e parë nga {rows.length}.</p>
        )}
      </div>
    )
    footer = (
      <>
        <Button variant="secondary" className="flex-1" onClick={() => setStep({ kind: 'pick' })}>
          Skedar tjetër
        </Button>
        <Button className="flex-[2]" disabled={valid.length === 0} onClick={() => void onImport(step.parsed)}>
          Importo {valid.length} produkte
        </Button>
      </>
    )
  } else if (step.kind === 'running') {
    body = (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <LoaderCircle className="size-8 animate-spin text-brand-600" aria-hidden />
        <p className="text-sm font-medium">{step.message}</p>
        <p className="text-xs text-muted">Mos e mbyll dritaren.</p>
      </div>
    )
  } else {
    const r = step.result
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CircleCheck className="size-10 text-brand-600" aria-hidden />
        <p className="text-base font-semibold">Importi përfundoi</p>
        <p className="text-sm text-muted">
          {r.created} produkte të reja · {r.updated} të përditësuara
          {r.categoriesCreated > 0 && ` · ${r.categoriesCreated} kategori të reja`}
          {r.stockSet > 0 && ` · stoku fillestar për ${r.stockSet}`}
        </p>
        {r.stockFailed > 0 && (
          <p className="text-sm text-warn-700">Stoku fillestar nuk u vendos për {r.stockFailed} produkte.</p>
        )}
      </div>
    )
    footer = (
      <Button block onClick={close}>
        Mbyll
      </Button>
    )
  }

  return (
    <Dialog open={open} onClose={close} title="Importo nga Excel" size={step.kind === 'preview' ? 'lg' : 'md'} footer={footer}>
      {error && (
        <p role="alert" className="mb-4 rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm font-medium text-warn-700">
          {error}
        </p>
      )}
      {body}
    </Dialog>
  )
}
