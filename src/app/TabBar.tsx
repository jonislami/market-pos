import { NavLink } from 'react-router-dom'
import { Ellipsis } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { canAccess, mainNav, settingsNav, type NavItem } from './nav'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] no-underline',
    isActive ? 'font-bold text-brand-600 hover:text-brand-600' : 'font-medium text-muted hover:text-ink',
  )

// Raportet lives under "Më shumë" on phones to keep the bar at five items.
const TAB_PATHS = ['/', '/arka', '/produktet', '/stoku']

export function TabBar() {
  const { profile } = useAuth()
  const role = profile?.role
  const tabs: NavItem[] = mainNav.filter((item) => TAB_PATHS.includes(item.to) && canAccess(item, role))
  const isCashier = role === 'cashier'

  return (
    <nav
      aria-label="Menuja kryesore"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 md:hidden"
    >
      {tabs.map((item) => {
        const Icon = item.icon
        return (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={tabClass}>
            <Icon className="size-[22px]" aria-hidden />
            {item.tabLabel}
          </NavLink>
        )
      })}
      <NavLink to={settingsNav.to} className={tabClass}>
        {isCashier ? <settingsNav.icon className="size-[22px]" aria-hidden /> : <Ellipsis className="size-[22px]" aria-hidden />}
        {isCashier ? settingsNav.tabLabel : 'Më shumë'}
      </NavLink>
    </nav>
  )
}
