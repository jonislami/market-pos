import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Copy, KeyRound, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card, Dialog, Input, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { useIsPlatformAdmin, useSetStoreActive, useStores } from '@/features/settings/api'
import { BUSINESS_TYPE_LIST, businessProfile, type BusinessType } from '@/lib/business'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/date'
import { getDeviceStoreId } from '@/lib/deviceStore'
import { errorMessage } from '@/lib/errors'
import type { Store } from '@/types/database'
import { credentialsText, generatePassword, useCreateBusiness, useResetOwnerPassword } from './api'

interface Credentials {
  business: string
  email: string
  password: string
}

/** Platform admin: all businesses on this installation, and creating new ones with their login. */
export function PlatformPage() {
  const isAdmin = useIsPlatformAdmin()
  const stores = useStores(isAdmin.data === true)
  const setActive = useSetStoreActive()
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<Store | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = getDeviceStoreId()

  if (isAdmin.isPending) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-7 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
      </div>
    )
  }
  if (!isAdmin.data) return <Navigate to="/" replace />

  const list = stores.data ?? []

  function toggle(s: Store) {
    setError(null)
    setActive.mutate({ id: s.id, active: !s.active }, { onError: (e) => setError(errorMessage(e)) })
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Platforma"
        subtitle={`${list.length} biznese · çdo biznes sheh vetëm të dhënat e veta`}
        actions={
          <Button icon={<Plus className="size-5" aria-hidden />} onClick={() => setAdding(true)}>
            Biznes i ri
          </Button>
        }
      />

      {(stores.isError || error) && <Card className="text-sm text-warn-700">{error ?? errorMessage(stores.error)}</Card>}

      {/* Desktop table */}
      <Card padded={false} className="hidden md:block">
        <Table shaded>
          <THead>
            <TR>
              <TH className="pl-5">Biznesi</TH>
              <TH>Lloji</TH>
              <TH>Pronari / hyrja</TH>
              <TH num>Përdorues</TH>
              <TH num>Shitje</TH>
              <TH>Statusi</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {list.map((s) => {
              const b = businessProfile(s.business_type)
              const Icon = b.icon
              return (
                <TR key={s.id}>
                  <TD className="pl-5">
                    <span className="flex flex-col">
                      <span className="font-semibold">
                        {s.name}
                        {s.id === current && <span className="ml-2 text-xs font-normal text-muted">(ky biznes)</span>}
                      </span>
                      <span className="text-xs text-muted">Krijuar më {formatDate(s.created_at)}</span>
                    </span>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2 text-sm">
                      <Icon className="size-4 text-brand-600" aria-hidden />
                      {b.label}
                    </span>
                  </TD>
                  <TD>
                    <span className="flex flex-col text-sm">
                      <span>{s.owner_name ?? '—'}</span>
                      <span className="text-xs text-muted">{s.owner_email ?? ''}</span>
                    </span>
                  </TD>
                  <TD num>{s.users}</TD>
                  <TD num>{s.sales}</TD>
                  <TD>{s.active ? <Badge tone="success">Aktiv</Badge> : <Badge>Joaktiv</Badge>}</TD>
                  <TD className="pr-5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => setResetting(s)}>
                        Fjalëkalim i ri
                      </Button>
                      {s.id !== current && (
                        <Button variant="ghost" size="sm" disabled={setActive.isPending} onClick={() => toggle(s)}>
                          {s.active ? 'Çaktivizo' : 'Aktivizo'}
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </Card>

      {/* Phone cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {list.map((s) => {
          const b = businessProfile(s.business_type)
          const Icon = b.icon
          return (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{s.name}</span>
                  <span className="text-xs text-muted">{b.label}</span>
                  <span className="truncate text-sm text-muted">{s.owner_email ?? ''}</span>
                </div>
                {s.active ? <Badge tone="success">Aktiv</Badge> : <Badge>Joaktiv</Badge>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="min-h-10 flex-1" onClick={() => setResetting(s)}>
                  Fjalëkalim i ri
                </Button>
                {s.id !== current && (
                  <Button variant="secondary" size="sm" className="min-h-10 flex-1" disabled={setActive.isPending} onClick={() => toggle(s)}>
                    {s.active ? 'Çaktivizo' : 'Aktivizo'}
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {adding && (
        <NewBusinessDialog
          onClose={() => setAdding(false)}
          onCreated={(c) => {
            setAdding(false)
            setCredentials(c)
          }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          store={resetting}
          onClose={() => setResetting(null)}
          onDone={(c) => {
            setResetting(null)
            setCredentials(c)
          }}
        />
      )}
      {credentials && <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />}
    </div>
  )
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-end gap-2">
      <Input
        label="Fjalëkalimi"
        hint="Së paku 8 karaktere. Ia jep klientit bashkë me email-in."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
        wrapperClassName="flex-1"
        autoComplete="new-password"
      />
      <Button variant="secondary" className="mb-6 size-11 shrink-0 px-0" aria-label="Gjenero fjalëkalim" onClick={() => onChange(generatePassword())}>
        <RefreshCw className="size-[18px]" aria-hidden />
      </Button>
    </div>
  )
}

function NewBusinessDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Credentials) => void }) {
  const create = useCreateBusiness()
  const [type, setType] = useState<BusinessType | null>(null)
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(generatePassword)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    if (!type) return setError('Zgjidh llojin e biznesit.')
    if (!name.trim()) return setError('Shkruaj emrin e biznesit.')
    if (!ownerName.trim()) return setError('Shkruaj emrin e pronarit.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Email i pavlefshëm.')
    if (password.length < 8) return setError('Fjalëkalimi duhet të ketë së paku 8 karaktere.')
    create.mutate(
      { name: name.trim(), type, ownerName: ownerName.trim(), email: email.trim().toLowerCase(), password },
      {
        onSuccess: () => onCreated({ business: name.trim(), email: email.trim().toLowerCase(), password }),
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Biznes i ri"
      size="md"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Anulo
          </Button>
          <Button className="flex-1" loading={create.isPending} onClick={submit}>
            Krijo biznesin
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Lloji i biznesit</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BUSINESS_TYPE_LIST.map((b) => {
              const Icon = b.icon
              const active = b.type === type
              return (
                <button
                  key={b.type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(b.type)}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left',
                    active ? 'border-brand-600 bg-brand-100' : 'border-line bg-white hover:bg-[#F7F9F7]',
                  )}
                >
                  <Icon className={cn('size-5 shrink-0', active ? 'text-brand-600' : 'text-muted')} aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold">{b.label}</span>
                    <span className="truncate text-xs text-muted">{b.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-amber-700">Lloji nuk mund të ndryshohet pasi të krijohet biznesi.</p>
        </fieldset>
        <Input label="Emri i biznesit" placeholder="p.sh. Sallon Bella" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Emri i pronarit" placeholder="p.sh. Arta Krasniqi" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          <Input label="Email-i për hyrje" placeholder="emri@shembull.com" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <PasswordField value={password} onChange={setPassword} />
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}

function ResetPasswordDialog({ store, onClose, onDone }: { store: Store; onClose: () => void; onDone: (c: Credentials) => void }) {
  const reset = useResetOwnerPassword()
  const [password, setPassword] = useState(generatePassword)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    if (password.length < 8) return setError('Fjalëkalimi duhet të ketë së paku 8 karaktere.')
    reset.mutate(
      { storeId: store.id, password },
      {
        onSuccess: (r) => onDone({ business: store.name, email: r.email || store.owner_email || '', password }),
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Fjalëkalim i ri për pronarin"
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Anulo
          </Button>
          <Button className="flex-1" loading={reset.isPending} onClick={submit}>
            Ndrysho
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <p className="text-sm text-muted">
          {store.name}
          {store.owner_email ? ` · ${store.owner_email}` : ''}. Fjalëkalimi i vjetër nuk vlen më.
        </p>
        <PasswordField value={password} onChange={setPassword} />
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}

/** Shown once after creating a business or a new password: copy it and send it to the client. */
function CredentialsDialog({ credentials, onClose }: { credentials: Credentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = credentialsText(credentials.business, credentials.email, credentials.password)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Të dhënat për hyrje"
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Mbyll
          </Button>
          <Button className="flex-1" icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} onClick={() => void copy()}>
            {copied ? 'U kopjua' : 'Kopjo'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Dërgoja klientit. Fjalëkalimi nuk shfaqet më pasi ta mbyllësh këtë dritare.</p>
        <pre className="whitespace-pre-wrap rounded-[10px] border border-line bg-[#F7F9F7] p-3 font-mono text-[13px] leading-relaxed">{text}</pre>
      </div>
    </Dialog>
  )
}
