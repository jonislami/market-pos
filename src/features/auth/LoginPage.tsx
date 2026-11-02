import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Check, Delete, Lock } from 'lucide-react'
import { Button, Input, Tabs, Toggle } from '@/components/ui'
import { LogoMark, STORE_NAME } from '@/components/Logo'
import { homePathFor } from '@/app/nav'
import { FullScreenLoader } from '@/app/AuthGuard'
import { isSupabaseConfigured } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { useAuth } from './AuthProvider'

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

/** Visual-only PIN pad; cashier PIN login is implemented in Phase 7. */
function PinPad() {
  const [pin, setPin] = useState('')

  function press(key: (typeof KEYS)[number]) {
    if (key === 'del') setPin((p) => p.slice(0, -1))
    else if (key) setPin((p) => (p.length < 4 ? p + key : p))
  }

  return (
    <div className="flex flex-col gap-5">
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
              aria-label={key === 'del' ? 'Fshi' : key}
              className="flex min-h-[60px] items-center justify-center rounded-xl border border-line bg-white text-[22px] font-semibold text-ink hover:bg-[#F0F3F1]"
            >
              {key === 'del' ? <Delete className="size-6" aria-hidden /> : key}
            </button>
          ),
        )}
      </div>
      <p className="rounded-[10px] bg-amber-100 px-3 py-2.5 text-center text-sm text-amber-700">
        Hyrja me PIN për arkëtarët aktivizohet së shpejti.
      </p>
      <Button size="lg" block disabled>
        Hyr
      </Button>
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
          <span className="text-xl font-bold">{STORE_NAME}</span>
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
          <span className="text-[15px] text-[#B5C7BD]">Hyr në {STORE_NAME}</span>
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
