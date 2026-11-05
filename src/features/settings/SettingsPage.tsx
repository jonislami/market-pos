import { Link, useSearchParams } from 'react-router-dom'
import { Bluetooth, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card } from '@/components/ui'
import { roleLabels } from '@/app/nav'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { usePrinterState } from '@/lib/printer/bluetooth'
import type { UserRole } from '@/types/database'
import { StaffSection } from '@/features/staff/StaffSection'
import { useActiveRegister, useBusiness, useIsPlatformAdmin } from './api'
import { PrinterSection } from './PrinterSection'
import { BackupSection, RegistersSection, StoreSection, UsersSection, VatSection } from './Sections'

type SectionId = 'store' | 'printer' | 'users' | 'staff' | 'registers' | 'vat' | 'backup'

const managers: UserRole[] = ['admin', 'manager']
const everyone: UserRole[] = ['admin', 'manager', 'cashier']

const SECTIONS: { id: SectionId; label: string; roles: UserRole[] }[] = [
  { id: 'store', label: 'Të dhënat e dyqanit', roles: managers },
  { id: 'printer', label: 'Printeri & Fatura', roles: everyone },
  { id: 'users', label: 'Përdoruesit & PIN-et', roles: managers },
  { id: 'registers', label: 'Arkat', roles: everyone },
  { id: 'vat', label: 'TVSH & Taksat', roles: managers },
  { id: 'backup', label: 'Kopje rezervë (Backup)', roles: managers },
]

/** Workers with commission: salons (migration 08). */
const STAFF_SECTION = { id: 'staff' as const, label: 'Punëtorët & Komisioni', roles: managers }

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function SectionBody({ id }: { id: SectionId }) {
  switch (id) {
    case 'store':
      return <StoreSection />
    case 'printer':
      return <PrinterSection />
    case 'users':
      return <UsersSection />
    case 'registers':
      return <RegistersSection />
    case 'vat':
      return <VatSection />
    case 'backup':
      return <BackupSection />
    case 'staff':
      return <StaffSection />
  }
}

export function SettingsPage() {
  const { profile, signOut } = useAuth()
  const role = profile?.role
  const [params, setParams] = useSearchParams()
  const printer = usePrinterState()

  const isPlatformAdmin = useIsPlatformAdmin(role === 'admin').data === true
  const business = useBusiness()
  // Workers come right after users; the platform section last.
  const sections = SECTIONS.flatMap((s) => (s.id === 'users' && business.type === 'salon' ? [s, STAFF_SECTION] : [s]))
.filter((s) => role && s.roles.includes(role))
  const requested = params.get('s') as SectionId | null
  const selected = sections.find((s) => s.id === requested)
  // Desktop always shows a section (printer by default); phones show the menu until one is chosen.
  const desktopSection = selected?.id ?? 'printer'
  const open = (id: SectionId | null) => setParams(id ? { s: id } : {}, { replace: false })
  const registerName = useActiveRegister().name

  return (
    <>
      {/* ===== Desktop ===== */}
      <div className="hidden flex-col gap-6 md:flex">
        <PageHeader title="Cilësimet" subtitle="Menaxho dyqanin, printerin, faturën dhe përdoruesit" />
        <div className="flex items-start gap-6">
          <nav aria-label="Seksionet e cilësimeve" className="flex w-[200px] shrink-0 flex-col gap-1">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => open(s.id)}
                className={cn(
                  'min-h-btn rounded-[10px] px-3.5 text-left text-sm',
                  desktopSection === s.id ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(0,0,0,.06)]' : 'text-[#33413A] hover:bg-white/60',
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1">
            <SectionBody id={desktopSection} />
          </div>
        </div>
      </div>

      {/* ===== Phone ===== */}
      <div className="flex flex-col gap-4 md:hidden">
        {selected ? (
          <>
            <button type="button" onClick={() => open(null)} className="-ml-1 flex min-h-btn items-center gap-1 self-start text-sm font-semibold text-brand-600">
              <ChevronLeft className="size-5" aria-hidden />
              Cilësimet
            </button>
            <h1 className="text-2xl font-bold">{selected.label}</h1>
            <SectionBody id={selected.id} />
          </>
        ) : (
          <>
            <header className="flex items-center gap-4 py-2">
              <span className="flex size-14 items-center justify-center rounded-full bg-[#2B4A3B] text-lg font-semibold text-white">
                {initials(profile?.full_name ?? '') || '?'}
              </span>
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold">Cilësimet</h1>
                <span className="text-sm text-muted">
                  {profile?.full_name} · {role ? roleLabels[role] : ''} · {registerName}
                </span>
              </div>
            </header>

            <Card className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#E8EEFD] text-bt-600">
                <Bluetooth className="size-6" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">Printeri i faturave</span>
                <span className="truncate text-sm text-muted">
                  {printer.status === 'unsupported'
                    ? 'Printim përmes shfletuesit'
                    : printer.status === 'connected'
                      ? printer.deviceName
                      : 'Asnjë printer i lidhur'}
                </span>
              </div>
              <Button variant={printer.status === 'connected' ? 'secondary' : 'bluetooth'} size="sm" className="min-h-10" onClick={() => open('printer')}>
                {printer.status === 'connected' ? 'Hap' : 'Lidh'}
              </Button>
            </Card>

            <Card padded={false} className="flex flex-col divide-y divide-line overflow-hidden">
              {sections
                .filter((s) => s.id !== 'printer')
                .map((s) => (
                  <button key={s.id} type="button" onClick={() => open(s.id)} className="flex min-h-14 items-center justify-between px-4 text-left text-[15px] hover:bg-[#F7F9F7]">
                    {s.label}
                    <ChevronRight className="size-5 text-muted" aria-hidden />
                  </button>
                ))}
              {isPlatformAdmin && (
                <Link to="/platforma" className="flex min-h-14 items-center justify-between px-4 text-[15px] text-ink no-underline hover:bg-[#F7F9F7] hover:text-ink">
                  Platforma (të gjitha bizneset)
                  <ChevronRight className="size-5 text-muted" aria-hidden />
                </Link>
              )}
              {role && managers.includes(role) && (
                <Link to="/raportet" className="flex min-h-14 items-center justify-between px-4 text-[15px] text-ink no-underline hover:bg-[#F7F9F7] hover:text-ink">
                  Raportet
                  <ChevronRight className="size-5 text-muted" aria-hidden />
                </Link>
              )}
              <button type="button" onClick={() => open('printer')} className="flex min-h-14 items-center justify-between px-4 text-left text-[15px] hover:bg-[#F7F9F7]">
                Pamja e faturës
                <span className="flex items-center gap-1 text-sm text-muted">
                  <Badge tone="neutral">Parapamja</Badge>
                  <ChevronRight className="size-5" aria-hidden />
                </span>
              </button>
            </Card>

            <Button
              variant="secondary"
              size="lg"
              className="border-[#F3C9A8] text-warn-700 hover:text-warn-700"
              icon={<LogOut className="size-5" aria-hidden />}
              onClick={() => void signOut()}
            >
              Dil nga llogaria
            </Button>
          </>
        )}
      </div>
    </>
  )
}
