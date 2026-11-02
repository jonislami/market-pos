import { NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { LogoMark, STORE_NAME } from '@/components/Logo'
import { cn } from '@/lib/cn'
import { useLowStockCount } from '@/features/stock/useLowStockCount'
import { canAccess, mainNav, roleLabels, settingsNav, type NavItem } from './nav'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-btn items-center gap-3 rounded-[10px] px-3 text-sm font-medium no-underline transition-colors',
    isActive ? 'bg-brand-100 text-[#0F2A1F] hover:text-[#0F2A1F]' : 'text-[#C9D6CF] hover:bg-brand-800 hover:text-white',
  )

function SidebarLink({ item, badge }: { item: NavItem; badge?: number }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.to === '/'} className={navClass}>
      <Icon className="size-[18px]" aria-hidden />
      {item.label}
      {badge ? (
        <span
          className="ml-auto rounded-full bg-warn-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-warn-700"
          title={`${badge} produkte nën minimum`}
        >
          {badge}
        </span>
      ) : null}
    </NavLink>
  )
}

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const role = profile?.role
  const name = profile?.full_name ?? ''
  const lowStock = useLowStockCount(role === 'admin' || role === 'manager')

  return (
    <nav
      aria-label="Menuja kryesore"
      className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-1 overflow-y-auto bg-brand-900 px-4 py-6 md:flex"
    >
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <LogoMark />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-bold text-white">{STORE_NAME}</span>
          <span className="text-xs text-[#8FA79A]">Dyqani qendror</span>
        </div>
      </div>

      {mainNav.filter((item) => canAccess(item, role)).map((item) => (
        <SidebarLink key={item.to} item={item} badge={item.to === '/stoku' ? lowStock : undefined} />
      ))}

      <div className="min-h-6 grow" />

      <SidebarLink item={settingsNav} />
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex min-h-btn items-center gap-3 rounded-[10px] px-3 text-left text-sm font-medium text-[#C9D6CF] transition-colors hover:bg-brand-800 hover:text-white"
      >
        <LogOut className="size-[18px]" aria-hidden />
        Dil
      </button>

      <div className="mt-2 flex items-center gap-2.5 border-t border-[#23402F] px-2 pt-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2B4A3B] text-[13px] font-semibold text-white">
          {initials(name) || '?'}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold text-white">{name}</span>
          <span className="text-xs text-[#8FA79A]">{role ? roleLabels[role] : ''}</span>
        </div>
      </div>
    </nav>
  )
}
