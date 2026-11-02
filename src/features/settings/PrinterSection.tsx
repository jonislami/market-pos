import { useEffect, useState } from 'react'
import { Bluetooth, Printer } from 'lucide-react'
import { ReceiptView } from '@/components/ReceiptView'
import { Badge, Button, Card, Input, Select, Toggle } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { bluetoothSupported, connectPrinter, disconnectPrinter, usePrinterState } from '@/lib/printer/bluetooth'
import { CHARSET_OPTIONS, updateDeviceSettings, useDeviceSettings, type Charset } from '@/lib/printer/deviceSettings'
import { printReceipt } from '@/lib/printer/print'
import type { StoreSettings } from '@/types/database'
import { useRegisters, useSaveStoreSettings, useStoreSettings } from './api'
import { sampleReceipt } from './sampleReceipt'

const CHUNK_OPTIONS = [20, 100, 180, 512].map((n) => ({ value: String(n), label: `${n} bytes` }))

/** Store fields shown on the receipt; reused by "Të dhënat e dyqanit". */
export function StoreInfoFields({ draft, set, disabled }: { draft: StoreSettings; set: (p: Partial<StoreSettings>) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input label="Titulli (emri i dyqanit)" value={draft.store_name} disabled={disabled} onChange={(e) => set({ store_name: e.target.value })} />
      <Input label="NUI" placeholder="Numri unik identifikues" value={draft.nui ?? ''} disabled={disabled} onChange={(e) => set({ nui: e.target.value || null })} />
      <Input label="Adresa" placeholder="Rruga, qyteti" value={draft.address ?? ''} disabled={disabled} onChange={(e) => set({ address: e.target.value || null })} />
      <Input label="Telefoni" placeholder="+383 ..." inputMode="tel" value={draft.phone ?? ''} disabled={disabled} onChange={(e) => set({ phone: e.target.value || null })} />
    </div>
  )
}

/** Local editable copy of the store settings, saved with one button. */
export function useSettingsDraft() {
  const settings = useStoreSettings()
  const save = useSaveStoreSettings()
  const [draft, setDraft] = useState<StoreSettings | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data)
  }, [settings.data, draft])

  const set = (p: Partial<StoreSettings>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const dirty = Boolean(draft && settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data))

  function submit(fields: (keyof StoreSettings)[]) {
    if (!draft) return
    setMessage(null)
    if (!draft.store_name.trim()) return setMessage({ ok: false, text: 'Emri i dyqanit nuk mund të jetë bosh.' })
    const patch = Object.fromEntries(fields.map((f) => [f, draft[f]])) as Partial<StoreSettings>
    save.mutate(patch, {
      onSuccess: () => setMessage({ ok: true, text: 'Ndryshimet u ruajtën.' }),
      onError: (err) => setMessage({ ok: false, text: errorMessage(err) }),
    })
  }

  return { settings, draft, set, dirty, submit, reset: () => setDraft(settings.data ?? null), saving: save.isPending, message }
}

const RECEIPT_FIELDS: (keyof StoreSettings)[] = [
  'store_name', 'nui', 'address', 'phone', 'receipt_footer', 'show_logo', 'show_vat_breakdown', 'show_barcode',
  'paper_width', 'receipt_copies', 'auto_print', 'open_cash_drawer',
]

export function PrinterSection() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'admin' || profile?.role === 'manager'
  const printer = usePrinterState()
  const device = useDeviceSettings()
  const registers = useRegisters()
  const { draft, set, dirty, submit, reset, saving, message } = useSettingsDraft()
  const [busy, setBusy] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  const registerName = registers.data?.find((r) => r.id === device.registerId)?.name ?? `Arka ${device.registerId}`

  async function connect(showAll = false) {
    setTestError(null)
    setBusy(true)
    try {
      await connectPrinter(showAll)
    } catch {
      // state.error carries the message
    } finally {
      setBusy(false)
    }
  }

  async function testPrint() {
    if (!draft) return
    setTestError(null)
    setBusy(true)
    try {
      await printReceipt(sampleReceipt(draft, registerName, profile?.full_name ?? ''), { copies: 1, openDrawer: false })
    } catch (err) {
      setTestError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!draft) return null
  const connected = printer.status === 'connected'

  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-[#E8EEFD] text-bt-600">
                <Bluetooth className="size-6" aria-hidden />
              </span>
              <div className="flex flex-col">
                <h2 className="text-[17px] font-semibold">Printeri i faturave (Bluetooth)</h2>
                <span className="text-[13px] text-muted">Printer termik 58mm ose 80mm</span>
              </div>
            </div>
            <Badge tone={connected ? 'success' : 'neutral'} dot>
              {connected ? 'I lidhur' : printer.status === 'connecting' ? 'Duke u lidhur…' : 'I palidhur'}
            </Badge>
          </div>

          {!bluetoothSupported ? (
            <div className="rounded-[10px] border border-dashed border-field p-4 text-sm text-muted">
              Ky shfletues nuk mbështet Bluetooth (p.sh. iPhone/Safari). Faturat printohen përmes dritares së printimit të
              shfletuesit (80mm). Për printer Bluetooth përdor Chrome ose Edge në kompjuter ose Android.
            </div>
          ) : connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-brand-100/50 p-4">
              <span className="flex items-center gap-2 text-sm">
                <Printer className="size-5 text-brand-600" aria-hidden />
                <strong>{printer.deviceName}</strong>
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="min-h-10" onClick={disconnectPrinter}>
                  Shkëput
                </Button>
                <Button size="sm" className="min-h-10" loading={busy} onClick={() => void testPrint()}>
                  Printo provë
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-[10px] border border-dashed border-field p-4">
              <p className="text-sm">Ndize printerin dhe Bluetooth-in e pajisjes, pastaj shtyp butonin për ta kërkuar.</p>
              <Button variant="bluetooth" loading={busy} icon={<Bluetooth className="size-5" aria-hidden />} onClick={() => void connect()}>
                {device.lastDeviceName ? `Rilidh ${device.lastDeviceName}` : 'Lidh printerin me Bluetooth'}
              </Button>
              <button type="button" className="text-[13px] font-semibold text-bt-600 underline" onClick={() => void connect(true)}>
                Printeri nuk shfaqet? Shfaq të gjitha pajisjet
              </button>
            </div>
          )}
          {(printer.error || testError) && (
            <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{testError ?? printer.error}</p>
          )}
          {!connected && (
            <Button variant="secondary" className="self-start" loading={busy} onClick={() => void testPrint()}>
              Printo provë {bluetoothSupported && !device.lastDeviceId ? '(me shfletuesin)' : ''}
            </Button>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Gjerësia e letrës"
              value={String(draft.paper_width)}
              disabled={!isManager}
              onChange={(e) => set({ paper_width: Number(e.target.value) as 58 | 80 })}
              options={[
                { value: '80', label: '80 mm' },
                { value: '58', label: '58 mm' },
              ]}
            />
            <Select
              label="Kopje për faturë"
              value={String(draft.receipt_copies ?? 1)}
              disabled={!isManager}
              onChange={(e) => set({ receipt_copies: Number(e.target.value) })}
              options={['1', '2', '3'].map((v) => ({ value: v, label: v }))}
            />
            <Select
              label="Shkronjat shqipe (ë, ç)"
              hint="Nëse në vend të ë/ç dalin simbole, provo një opsion tjetër."
              value={device.charset}
              onChange={(e) => updateDeviceSettings({ charset: e.target.value as Charset })}
              options={CHARSET_OPTIONS}
            />
            <Select
              label="Madhësia e paketave Bluetooth"
              hint="Ul vlerën nëse fatura del e prerë ose me karaktere të çuditshme."
              value={String(device.chunkSize)}
              onChange={(e) => updateDeviceSettings({ chunkSize: Number(e.target.value) })}
              options={CHUNK_OPTIONS}
            />
          </div>
          <div className="flex flex-col">
            <Toggle layout="row" label="Printo automatikisht pas pagesës" description='Fatura del sapo shtypet "Paguaj"' checked={draft.auto_print} disabled={!isManager} onChange={(v) => set({ auto_print: v })} />
            <Toggle layout="row" label="Hap sirtarin e parave (kasa)" description="Vetëm për pagesat me kesh" checked={draft.open_cash_drawer} disabled={!isManager} onChange={(v) => set({ open_cash_drawer: v })} />
          </div>
        </Card>

        {isManager && (
          <Card className="flex flex-col gap-4">
            <h2 className="text-[17px] font-semibold">Pamja e faturës</h2>
            <StoreInfoFields draft={draft} set={set} />
            <Input label="Teksti në fund të faturës" value={draft.receipt_footer ?? ''} onChange={(e) => set({ receipt_footer: e.target.value || null })} />
            <div className="flex flex-col">
              <Toggle layout="row" label="Shfaq logon" checked={draft.show_logo} onChange={(v) => set({ show_logo: v })} />
              <Toggle layout="row" label="Shfaq ndarjen e TVSH-së" checked={draft.show_vat_breakdown} onChange={(v) => set({ show_vat_breakdown: v })} />
              <Toggle layout="row" label="Shfaq barkodin e faturës" checked={draft.show_barcode !== false} onChange={(v) => set({ show_barcode: v })} />
            </div>
          </Card>
        )}

        {isManager && (
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {message && <p className={message.ok ? 'mr-auto text-sm text-brand-600' : 'mr-auto text-sm text-warn-700'}>{message.text}</p>}
            <Button variant="secondary" disabled={!dirty} onClick={reset}>
              Anulo
            </Button>
            <Button loading={saving} disabled={!dirty} onClick={() => submit(RECEIPT_FIELDS)}>
              Ruaj ndryshimet
            </Button>
          </div>
        )}
        {!isManager && <p className="text-[13px] text-muted">Gjerësia e letrës dhe printimi automatik ndryshohen nga menaxheri.</p>}
      </div>

      <aside className="hidden flex-col gap-3 rounded-card bg-[#E9EDEA] p-5 md:flex xl:sticky xl:top-8 xl:w-[360px] xl:shrink-0">
        <span className="text-xs font-semibold text-muted">PARAPAMJA · {draft.paper_width}mm</span>
        <div className="overflow-x-auto">
          <ReceiptView
            data={sampleReceipt(draft, registerName, profile?.full_name ?? 'Arkëtari')}
            className={cn('mx-auto py-5 shadow-sm', draft.paper_width === 80 ? 'px-2 text-[10.5px]' : 'px-4 text-[12px]')}
          />
        </div>
      </aside>
    </div>
  )
}
