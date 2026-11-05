import { Link } from 'react-router-dom'
import { BarChart3, Bluetooth, Check, LogIn, Smartphone, Users, WifiOff, type LucideIcon } from 'lucide-react'
import { LogoMark } from '@/components/Logo'
import { buttonClasses } from '@/components/ui'
import { BUSINESS_TYPE_LIST } from '@/lib/business'
import { cn } from '@/lib/cn'

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Smartphone, title: 'Kompjuter dhe telefon', text: 'I njëjti aplikacion në arkë, në tablet dhe në telefon – instalohet si aplikacion.' },
  { icon: WifiOff, title: 'Punon pa internet', text: 'Shitjet ruhen në pajisje dhe dërgohen vetë kur kthehet lidhja.' },
  { icon: Bluetooth, title: 'Printer Bluetooth', text: 'Fatura në printer termik 58/80 mm, ose përmes shfletuesit.' },
  { icon: Users, title: 'Arkëtarë me PIN', text: 'Pronari hyn me email; arkëtarët me PIN 4-shifror, pa çmime blerjeje.' },
  { icon: BarChart3, title: 'Raporte të qarta', text: 'Shitjet ditore, TVSH sipas normës, produktet më të shitura dhe eksport në Excel.' },
]

const loginButton = (extra?: string) => cn(buttonClasses({ size: 'lg' }), 'no-underline hover:text-white', extra)

/** Public front page: what the platform does, for which businesses, and the way in. */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pb-4 pt-[max(env(safe-area-inset-top),16px)] md:px-8 md:py-5">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-lg font-bold">Market POS</span>
          </div>
          <Link to="/login" className={cn(buttonClasses({ variant: 'secondary', size: 'md' }), 'no-underline')}>
            <LogIn className="size-4" aria-hidden />
            Hyr
          </Link>
        </div>

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-14 pt-8 md:px-8 md:pb-20 md:pt-14">
          <h1 className="max-w-3xl text-[34px] font-bold leading-[1.1] tracking-[-0.03em] md:text-[52px]">
            Arka, stoku dhe raportet për biznesin tënd në Kosovë.
          </h1>
          <p className="max-w-2xl text-[17px] leading-normal text-[#B5C7BD] md:text-lg">
            Një platformë për markete, kafiteri, barnatore, butikë dhe sallone – me të njëjtin dizajn të thjeshtë, në
            kompjuter dhe në telefon.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/login" className={loginButton()}>
              <LogIn className="size-5" aria-hidden />
              Hyr në llogari
            </Link>
            <span className="text-sm text-[#8FA79A]">Llogarinë ta krijon administratori i platformës.</span>
          </div>
        </section>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-12 md:px-8 md:py-16">
        <section aria-labelledby="types" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h2 id="types" className="text-2xl font-bold tracking-[-0.02em] md:text-[28px]">
              Për çdo lloj biznesi
            </h2>
            <p className="text-muted">Secili biznes ka modulet e veta; të dhënat e tij nuk i sheh askush tjetër.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {BUSINESS_TYPE_LIST.map((b) => {
              const Icon = b.icon
              return (
                <div key={b.type} className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold">{b.label}</h3>
                    <p className="text-sm text-muted">{b.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="features" className="flex flex-col gap-5">
          <h2 id="features" className="text-2xl font-bold tracking-[-0.02em] md:text-[28px]">
            Çfarë përfshihet
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3 rounded-card border border-line bg-white p-5">
                <f.icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-start gap-5 rounded-card bg-brand-900 p-6 text-white md:flex-row md:items-center md:justify-between md:p-10">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold tracking-[-0.02em]">Si fillohet</h2>
            <ol className="flex flex-col gap-2 text-[15px] text-[#C9D6CF]">
              {['Administratori krijon biznesin tënd dhe të jep email-in dhe fjalëkalimin.', 'Hyr, shto produktet ose shërbimet dhe arkëtarët me PIN.', 'Fillo shitjen – në kompjuter, tablet ose telefon.'].map(
                (step) => (
                  <li key={step} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#6EE7B0]" strokeWidth={2.4} aria-hidden />
                    {step}
                  </li>
                ),
              )}
            </ol>
          </div>
          <Link to="/login" className={loginButton('shrink-0 bg-brand-400 text-brand-900 hover:bg-[#5FD39E] hover:text-brand-900')}>
            <LogIn className="size-5" aria-hidden />
            Hyr në llogari
          </Link>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">Market POS · Kosovë</footer>
    </div>
  )
}
