import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Button, Card, Dialog, Input, Select, Table, TBody, TD, TH, THead, Toggle, TR } from '@/components/ui'
import { roleLabels } from '@/app/nav'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { updateDeviceSettings } from '@/lib/printer/deviceSettings'
import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/date'
import { VAT_CODES, VAT_RATES } from '@/lib/vat'
import type { Profile, Register, UserRole } from '@/types/database'
import { settingsKeys, useActiveRegister, useBusiness, useProfiles, useRegisters, useSaveRegister, useSetPin, useUpdateProfile, type ProfileRow } from './api'
import { StoreInfoFields, useSettingsDraft } from './PrinterSection'
import { useQueryClient } from '@tanstack/react-query'

// ---------- Store data ----------

export function StoreSection() {
  const { draft, set, dirty, submit, reset, saving, message } = useSettingsDraft()
  const business = useBusiness()
  if (!draft) return null
  const BusinessIcon = business.icon
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-semibold">Të dhënat e dyqanit</h2>
        <p className="text-[13px] text-muted">Shfaqen në krye të faturës dhe në menu.</p>
      </div>
      <div className="flex items-center gap-3 rounded-[10px] border border-line bg-[#F7F9F7] px-3 py-2.5 text-sm">
        <BusinessIcon className="size-5 text-brand-600" aria-hidden />
        <span>
          Lloji i biznesit: <strong>{business.label}</strong>
        </span>
        <span className="ml-auto text-xs text-muted">Ndryshohet nga administratori i platformës</span>
      </div>
      <StoreInfoFields draft={draft} set={set} />
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {message && <p className={message.ok ? 'mr-auto text-sm text-brand-600' : 'mr-auto text-sm text-warn-700'}>{message.text}</p>}
        <Button variant="secondary" disabled={!dirty} onClick={reset}>
          Anulo
        </Button>
        <Button loading={saving} disabled={!dirty} onClick={() => submit(['store_name', 'nui', 'address', 'phone'])}>
          Ruaj ndryshimet
        </Button>
      </div>
    </Card>
  )
}

// ---------- Users ----------

const ROLE_OPTIONS = (Object.keys(roleLabels) as UserRole[]).map((r) => ({ value: r, label: roleLabels[r] }))

export function UsersSection() {
  const { profile: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const profiles = useProfiles()
  const [editing, setEditing] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)
  const [pinFor, setPinFor] = useState<ProfileRow | null>(null)
  const pinSupported = (profiles.data ?? []).some((p) => p.has_pin !== null)
  // Admin manages every PIN; a manager only cashiers' PINs (enforced again in set_pin).
  const canSetPin = (p: ProfileRow) => pinSupported && (isAdmin || p.role === 'cashier')

  return (
    <div className="flex flex-col gap-5">
      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <h2 className="text-[17px] font-semibold">Përdoruesit</h2>
          {isAdmin && (
            <Button size="sm" className="min-h-10" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
              Shto profil
            </Button>
          )}
        </div>
        {profiles.error ? (
          <p className="px-5 pb-5 text-sm text-warn-700">{errorMessage(profiles.error)}</p>
        ) : (
          <Table shaded>
            <THead>
              <TR>
                <TH className="pl-5">Emri</TH>
                <TH>Roli</TH>
                <TH>Statusi</TH>
                <TH>PIN</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(profiles.data ?? []).map((p) => (
                <TR key={p.id}>
                  <TD className="pl-5 font-semibold">
                    {p.full_name}
                    {p.id === me?.id && <span className="ml-2 text-xs font-normal text-muted">(ti)</span>}
                  </TD>
                  <TD>{roleLabels[p.role]}</TD>
                  <TD>{p.active ? <Badge tone="success">Aktiv</Badge> : <Badge>Joaktiv</Badge>}</TD>
                  <TD>{p.has_pin === null ? '—' : p.has_pin ? <Badge tone="success">I vendosur</Badge> : <Badge>Pa PIN</Badge>}</TD>
                  <TD className="pr-5 text-right">
                    <div className="flex justify-end gap-1">
                      {canSetPin(p) && (
                        <Button variant="ghost" size="sm" onClick={() => setPinFor(p)}>
                          PIN
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                          Ndrysho
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="flex flex-col gap-2 text-sm">
        <h3 className="font-semibold">Si shtohet një përdorues i ri</h3>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>
            Në Supabase hap <strong className="text-ink">Authentication → Users → Add user</strong>, shkruaj email-in dhe
            fjalëkalimin, dhe zgjidh "Auto Confirm User". Për arkëtarët mjafton një email i brendshëm (p.sh.
            arketari1@dyqani.local) dhe një fjalëkalim i gjatë – ata hyjnë me PIN.
          </li>
          <li>Kopjo "User UID" të përdoruesit të ri.</li>
          <li>Këtu shtyp "Shto profil", ngjit UID-në dhe zgjidh rolin.</li>
          <li>Për arkëtarët shtyp "PIN" dhe vendos PIN-in me 4 shifra.</li>
        </ol>
        {!pinSupported && profiles.data && (
          <p className="text-amber-700">PIN-et aktivizohen pasi të ekzekutohet migrimi 05 në Supabase.</p>
        )}
      </Card>

      {editing && <ProfileDialog profile={editing} isSelf={editing.id === me?.id} onClose={() => setEditing(null)} />}
      {adding && <AddProfileDialog onClose={() => setAdding(false)} />}
      {pinFor && <PinDialog profile={pinFor} onClose={() => setPinFor(null)} />}
    </div>
  )
}

function PinDialog({ profile, onClose }: { profile: ProfileRow; onClose: () => void }) {
  const setPin = useSetPin()
  const [pin, setPinText] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    if (!/^[0-9]{4}$/.test(pin)) return setError('PIN-i duhet të ketë saktësisht 4 shifra.')
    if (pin !== repeat) return setError('PIN-et nuk përputhen.')
    setPin.mutate({ id: profile.id, pin }, { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) })
  }

  function clear() {
    if (!window.confirm(`Hiq PIN-in e ${profile.full_name}? Nuk do të mund të hyjë më me PIN.`)) return
    setPin.mutate({ id: profile.id, pin: null }, { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) })
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  return (
    <Dialog
      open
      onClose={onClose}
      title={`PIN për ${profile.full_name}`}
      size="sm"
      footer={
        <>
          {profile.has_pin && (
            <Button variant="ghost" className="text-warn-700 hover:text-warn-700" onClick={clear}>
              Hiq PIN
            </Button>
          )}
          <Button variant="secondary" className="ml-auto" onClick={onClose}>
            Anulo
          </Button>
          <Button loading={setPin.isPending} onClick={save}>
            Ruaj PIN
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="PIN i ri (4 shifra)" type="password" inputMode="numeric" autoComplete="new-password" autoFocus value={pin} onChange={(e) => setPinText(digits(e.target.value))} className="text-center text-xl tracking-[0.5em]" />
        <Input label="Përsërite PIN-in" type="password" inputMode="numeric" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(digits(e.target.value))} className="text-center text-xl tracking-[0.5em]" />
        <p className="text-[13px] text-muted">Pas 5 PIN-eve të gabuara, hyrja bllokohet për 15 minuta.</p>
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}

function ProfileDialog({ profile, isSelf, onClose }: { profile: Profile; isSelf: boolean; onClose: () => void }) {
  const update = useUpdateProfile()
  const [name, setName] = useState(profile.full_name)
  const [role, setRole] = useState<UserRole>(profile.role)
  const [active, setActive] = useState(profile.active)
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (!name.trim()) return setError('Shkruaj emrin.')
    update.mutate({ id: profile.id, full_name: name.trim(), role, active }, { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Ndrysho përdoruesin"
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Anulo
          </Button>
          <Button className="flex-1" loading={update.isPending} onClick={save}>
            Ruaj
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Emri" value={name} onChange={(e) => setName(e.target.value)} />
        {/* An admin can't demote or deactivate themselves and lock everyone out. */}
        <Select label="Roli" value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as UserRole)} options={ROLE_OPTIONS} />
        <Toggle label="Llogari aktive" checked={active} disabled={isSelf} onChange={setActive} />
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}

function AddProfileDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [uid, setUid] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('cashier')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setError(null)
    if (!/^[0-9a-f-]{36}$/i.test(uid.trim())) return setError('UID duhet të jetë si 1a2b3c4d-....-.... (36 karaktere).')
    if (!name.trim()) return setError('Shkruaj emrin.')
    setSaving(true)
    const { error: e } = await supabase.from('profiles').insert({ id: uid.trim(), full_name: name.trim(), role })
    setSaving(false)
    if (e) {
      setError(e.code === '23503' ? 'Ky UID nuk ekziston te Authentication → Users.' : e.code === '23505' ? 'Ky përdorues ka tashmë profil.' : errorMessage(e))
      return
    }
    void qc.invalidateQueries({ queryKey: settingsKeys.profiles })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Shto profil"
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Anulo
          </Button>
          <Button className="flex-1" loading={saving} onClick={() => void save()}>
            Shto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="User UID (nga Supabase)" placeholder="1a2b3c4d-…" value={uid} onChange={(e) => setUid(e.target.value)} className="font-mono text-[13px]" />
        <Input label="Emri" placeholder="p.sh. Arkëtari 2" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Roli" value={role} onChange={(e) => setRole(e.target.value as UserRole)} options={ROLE_OPTIONS} />
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}

// ---------- Registers ----------

export function RegistersSection() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'admin' || profile?.role === 'manager'
  const registers = useRegisters()
  const activeRegister = useActiveRegister()
  const [editing, setEditing] = useState<Register | 'new' | null>(null)
  const active = (registers.data ?? []).filter((r) => r.active)

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">Arka e kësaj pajisjeje</h2>
        <p className="text-[13px] text-muted">Shitjet nga kjo pajisje regjistrohen në këtë arkë dhe ajo shfaqet në faturë.</p>
        <Select
          aria-label="Arka e kësaj pajisjeje"
          value={String(activeRegister.id)}
          onChange={(e) => updateDeviceSettings({ registerId: Number(e.target.value) })}
          options={active.map((r) => ({ value: String(r.id), label: r.name }))}
          wrapperClassName="max-w-sm"
        />
      </Card>

      {isManager && (
        <Card padded={false}>
          <div className="flex items-center justify-between gap-3 p-5 pb-3">
            <h2 className="text-[17px] font-semibold">Arkat e dyqanit</h2>
            <Button size="sm" className="min-h-10" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
              Arkë e re
            </Button>
          </div>
          <Table shaded>
            <THead>
              <TR>
                <TH className="pl-5">Nr.</TH>
                <TH>Emri</TH>
                <TH>Statusi</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(registers.data ?? []).map((r) => (
                <TR key={r.id}>
                  <TD className="pl-5 tabular-nums text-muted">{r.id}</TD>
                  <TD className="font-semibold">{r.name}</TD>
                  <TD>{r.active ? <Badge tone="success">Aktive</Badge> : <Badge>Joaktive</Badge>}</TD>
                  <TD className="pr-5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                      Ndrysho
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {editing && <RegisterDialog register={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function RegisterDialog({ register, onClose }: { register: Register | null; onClose: () => void }) {
  const save = useSaveRegister()
  const [name, setName] = useState(register?.name ?? '')
  const [active, setActive] = useState(register?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!name.trim()) return setError('Shkruaj emrin e arkës.')
    save.mutate({ id: register?.id, name: name.trim(), active }, { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={register ? 'Ndrysho arkën' : 'Arkë e re'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Anulo
          </Button>
          <Button className="flex-1" loading={save.isPending} onClick={submit}>
            Ruaj
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Emri" placeholder="p.sh. Arka 2 – Hyrja anësore" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Toggle label="Aktive" checked={active} onChange={setActive} />
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}

// ---------- VAT ----------

export function VatSection() {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold">TVSH & Taksat</h2>
      <Table shaded>
        <THead>
          <TR>
            <TH>Kodi në faturë</TH>
            <TH>Norma</TH>
            <TH>Përdorimi</TH>
          </TR>
        </THead>
        <TBody>
          {VAT_RATES.map((r) => (
            <TR key={r}>
              <TD className="font-semibold">{VAT_CODES[r]}</TD>
              <TD>{r}%</TD>
              <TD className="whitespace-normal text-muted">
                {r === 18 ? 'Norma standarde' : r === 8 ? 'Norma e reduktuar (ushqime bazë etj.)' : 'Të liruara nga TVSH'}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Çmimet e shitjes përfshijnë TVSH-në. Baza = çmimi / (1 + norma).</li>
        <li>TVSH-ja llogaritet një herë për çdo normë në faturë, dhe ndarja shfaqet në fund të faturës.</li>
        <li>Norma e çdo produkti zgjidhet te Produktet.</li>
        <li>Fatura shënohet "Kupon jo-fiskal" – arka fiskale nuk është e lidhur.</li>
      </ul>
    </Card>
  )
}

// ---------- Backup ----------

async function fetchAll(table: string, columns: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + 999)
    if (error) throw error
    out.push(...(data as unknown as Record<string, unknown>[]))
    if (data.length < 1000) return out
  }
}

function sheet(name: string, rows: Record<string, unknown>[]) {
  const keys = rows.length ? Object.keys(rows[0]) : ['—']
  return {
    sheet: name,
    data: [
      keys.map((k) => ({ value: k, fontWeight: 'bold' as const })),
      ...rows.map((r) => keys.map((k) => ({ value: r[k] === null || r[k] === undefined ? '' : String(r[k]) }))),
    ],
  }
}

export function BackupSection() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function download() {
    setBusy(true)
    setMessage(null)
    try {
      const [products, categories, suppliers, registers] = await Promise.all([
        fetchAll('products', 'id, barcode, name, category_id, unit, cost_price, sale_price, vat_rate, stock, min_stock, show_in_pos, active'),
        fetchAll('categories', 'id, name, sort_order'),
        fetchAll('suppliers', 'id, name, nui, phone, payment_days'),
        fetchAll('registers', 'id, name, active'),
      ])
      const { default: writeXlsxFile } = await import('write-excel-file/browser')
      await writeXlsxFile(
        [sheet('Produktet', products), sheet('Kategoritë', categories), sheet('Furnitorët', suppliers), sheet('Arkat', registers)] as never,
      ).toFile(`kopje-rezerve-${todayISO()}.xlsx`)
      setMessage({ ok: true, text: `U shkarkuan ${products.length} produkte, ${categories.length} kategori dhe ${suppliers.length} furnitorë.` })
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold">Kopje rezervë</h2>
      <p className="text-sm text-muted">
        Të dhënat ruhen në Supabase. Për siguri shtesë shkarko herë pas here katalogun (produktet, kategoritë, furnitorët,
        arkat) në Excel. Shitjet i eksporton te Raportet → Eksporto në Excel.
      </p>
      <Button className="self-start" loading={busy} onClick={() => void download()}>
        Shkarko kopjen rezervë (Excel)
      </Button>
      {message && <p className={message.ok ? 'text-sm text-brand-600' : 'text-sm text-warn-700'}>{message.text}</p>}
    </Card>
  )
}
