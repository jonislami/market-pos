import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Delete, LoaderCircle, Lock } from 'lucide-react'
import { Button, Input, Tabs, Toggle } from '@/components/ui'
import { LogoMark } from '@/components/Logo'
import { cachedStoreName } from '@/features/settings/api'
import { homePathFor } from '@/app/nav'
import { FullScreenLoader } from '@/app/AuthGuard'
import { isSupabaseConfigured } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fetchPinUsers, useAuth } from './AuthProvider'

type Mode = 'manager' | 'pin'

const modeTabs = [
  { value: 'manager' as const, label: 'Menaxher' },
  { value: 'pin' as const, label: 'Arkëtar (PIN)' },
]

const features = ['Punon edhe pa internet', 'Printer me Bluetooth', 'Disa arka e përdorues']

function authErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (/invalid login credentials/i.test(msg)) return 'Email ose fjalëkalim i gabuar.'
  if (/email not confirmed/i.test(msg)) return 'Email-i nuk është konfirmuar ende.'
  if (/fetch|network/i.test(msg)) return 'Nuk u lidh me serverin. Kontrollo internetin.'
  return 'Hyrja dështoi. Provo përsëri.'
}

function ManagerForm() {
  const { signInWithPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) {
      setError('Shkruaj email-in dhe fjalëkalimin.')
      return
    }
    setSubmitting(true)
    try {
      await signInWithPassword(email.trim(), password, remember)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const forgot = (
    <button
      type="button"
      onClick={() => setInfo('Për të rivendosur fjalëkalimin, kontakto administratorin e dyqanit.')}
      className="text-[13px] font-semibold text-brand-600 underline hover:text-[#0A5039]"
    >
      <span className="md:hidden">Harrove?</span>
      <span className="hidden md:inline">Harrove fjalëkalimin?</span>
    </button>
  )

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        label="Email ose përdoruesi"
        type="email"
        autoComplete="username"
        inputMode="email"
        placeholder="emri@market.com"
        size="lg"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        label="Fjalëkalimi"
        labelAside={<span className="hidden md:inline">{forgot}</span>}
        type="password"
        autoComplete="current-password"
        size="lg"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <Toggle
          checked={remember}
          onChange={setRemember}
          label={
            <>
              <span className="md:hidden">Më mbaj mend</span>
              <span className="hidden md:inline">Më mbaj të kyçur në këtë pajisje</span>
            </>
          }
        />
        <span className="md:hidden">{forgot}</span>
      </div>

      {error && (
        <p role="alert" className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm font-medium text-warn-700">
          {error}
        </p>
      )}
      {info && <p className="rounded-[10px] bg-brand-100 px-3 py-2.5 text-sm text-brand-600">{info}</p>}

      <Button type="submit" size="lg" block loading={submitting} disabled={!isSupabaseConfigured}>
        Hyr
      </Button>
    </form>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

const LAST_PIN_USER = 'market-pos.last-pin-user'

function readLastPinUser(): string | null {
  try {
    return localStorage.getItem(LAST_PIN_USER)
  } catch {
    return null
  }
}

/** Cashier login: pick your name once (remembered on this device), then type the 4-digit PIN. */
function PinPad() {
  const { signInWithPin } = useAuth()
  const users = useQuery({ queryKey: ['pin-users'], queryFn: fetchPinUsers, retry: false, staleTime: 60_000 })
  const [chosenId, setChosenId] = useState<string | null>(readLastPinUser)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const list = users.data ?? []
  // A single PIN user is chosen automatically; a remembered user only if still in the list.
  const chosen = list.find((u) => u.id === chosenId) ?? (list.length === 1 ? list[0] : undefined)

  const submit = useCallback(
    async (code: string) => {
      if (!chosen) return
      setSubmitting(true)
      setError(null)
      try {
        await signInWithPin(chosen.id, code)
        try {
          localStorage.setItem(LAST_PIN_USER, chosen.id)
        } catch {
          // Not critical.
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Hyrja dështoi.')
        setPin('')
      } finally {
        setSubmitting(false)
      }
    },
    [chosen, signInWithPin],
  )

  const press = useCallback(
    (key: (typeof KEYS)[number]) => {
      if (submitting) return
      setError(null)
      if (key === 'del') return setPin((p) => p.slice(0, -1))
      if (!key || pin.length >= 4) return
      const next = pin + key
      setPin(next)
      if (next.length === 4) void submit(next)
    },
    [pin, submit, submitting],
  )

  // Physical keyboard / numpad.
  useEffect(() => {
    if (!chosen) return
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number])
      else if (e.key === 'Backspace') press('del')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chosen, press])

  if (users.isPending) {
    return (
      <div className="flex justify-center py-10">
        <LoaderCircle className="size-7 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
      </div>
    )
  }
  if (users.error) {
    return <p className="rounded-[10px] bg-amber-100 px-3 py-2.5 text-sm text-amber-700">{(users.error as Error).message}</p>
  }
  if (list.length === 0) {
    return (
      <p className="rounded-[10px] bg-amber-100 px-3 py-2.5 text-sm text-amber-700">
        Asnjë arkëtar nuk ka PIN ende. Menaxheri e vendos te Cilësimet → Përdoruesit & PIN-et.
      </p>
    )
  }

  if (!chosen) {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-[#33413A]">Kush je?</span>
        <div className="grid grid-cols-2 gap-2.5">
          {list.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setChosenId(u.id)}
              className="flex min-h-[60px] items-center gap-2.5 rounded-xl border border-line bg-white px-3 text-left text-sm font-semibold hover:border-brand-600"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[13px] text-brand-600">
                {u.full_name.slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{u.full_name}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
        <span className="text-sm">
          <span className="text-muted">Arkëtari: </span>
          <strong>{chosen.full_name}</strong>
        </span>
        {list.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setChosenId(null)
              setPin('')
              setError(null)
            }}
            className="text-[13px] font-semibold text-brand-600 underline"
          >
            Ndërro
          </button>
        )}
      </div>
      <div className="flex justify-center gap-4" aria-label={`${pin.length} nga 4 shifra`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('size-4 rounded-full border-2 border-brand-600', i < pin.length && 'bg-brand-600')}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              disabled={submitting}
              aria-label={key === 'del' ? 'Fshi' : key}
              className="flex min-h-[60px] items-center justify-center rounded-xl border border-line bg-white text-[22px] font-semibold text-ink hover:bg-[#F0F3F1] disabled:opacity-60"
            >
              {key === 'del' ? <Delete className="size-6" aria-hidden /> : key}
            </button>
          ),
        )}
      </div>
      {submitting && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Duke hyrë…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-center text-sm font-medium text-warn-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function LoginPage() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>('manager')

  if (loading) return <FullScreenLoader />
  if (session && profile) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : homePathFor(profile.role)} replace />
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      {/* Desktop intro panel */}
      <section
        aria-label="Prezantimi"
        className="hidden flex-col justify-between gap-12 bg-brand-900 p-12 text-white md:flex md:flex-[1_1_420px]"
      >
        <div className="flex items-center gap-3">
          <LogoMark size="md" />
          <span className="text-xl font-bold">{cachedStoreName()}</span>
        </div>
        <div className="flex max-w-[460px] flex-col gap-4">
          <h1 className="text-[44px] font-bold leading-[1.1] tracking-[-0.03em]">Shitja, stoku dhe raportet në një vend.</h1>
          <p className="text-[17px] leading-normal text-[#B5C7BD]">
            Arka e shpejtë me barkod, hyrjet e mallit nga furnitorët dhe pasqyra e ditës – nga kompjuteri ose telefoni.
          </p>
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-[#B5C7BD]">
          {features.map((f) => (
            <span key={f} className="flex items-center gap-2">
              <Check className="size-4 text-[#6EE7B0]" strokeWidth={2.4} aria-hidden />
              {f}
            </span>
          ))}
        </div>
      </section>

      {/* Mobile header */}
      <header className="flex flex-col gap-5 rounded-b-[28px] bg-brand-900 px-6 pb-10 pt-[max(env(safe-area-inset-top),64px)] text-white md:hidden">
        <LogoMark size="lg" />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Mirë se erdhe</h1>
          <span className="text-[15px] text-[#B5C7BD]">Hyr në {cachedStoreName()}</span>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 py-8 md:flex-[1_1_520px] md:items-center md:py-12">
        <div className="flex w-full max-w-[420px] flex-col gap-6">
          <div className="hidden flex-col gap-1.5 md:flex">
            <h2 className="text-[28px] font-bold tracking-[-0.02em]">Mirë se erdhe</h2>
            <span className="text-[15px] text-muted">Hyr në llogarinë tënde për të vazhduar</span>
          </div>

          {!isSupabaseConfigured && (
            <p role="alert" className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">
              Supabase nuk është konfiguruar. Kopjo <code>.env.example</code> si <code>.env.local</code> dhe plotëso
              çelësat.
            </p>
          )}

          <Tabs items={modeTabs} value={mode} onChange={setMode} variant="segmented" label="Lloji i hyrjes" className="hidden md:grid" />

          {mode === 'manager' ? <ManagerForm /> : <PinPad />}

          {/* Mobile: switch between email and PIN login */}
          <div className="flex flex-col gap-4 md:hidden">
            <div className="flex items-center gap-3 text-sm text-muted">
              <span className="h-px flex-1 bg-line" />
              ose
              <span className="h-px flex-1 bg-line" />
            </div>
            <Button
              variant="secondary"
              size="lg"
              block
              icon={mode === 'manager' ? <Lock className="size-5" aria-hidden /> : undefined}
              onClick={() => setMode(mode === 'manager' ? 'pin' : 'manager')}
            >
              {mode === 'manager' ? 'Hyr si arkëtar me PIN' : 'Hyr me email dhe fjalëkalim'}
            </Button>
          </div>

          <span className="text-center text-[13px] text-muted">
            Ke problem me hyrjen? Kontakto administratorin<span className="hidden md:inline"> e dyqanit</span>.
          </span>
        </div>
      </main>
    </div>
  )
}
