import { ChartColumn, LayoutDashboard, Package, Settings, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types/database'

export interface NavItem {
  to: string
  label: string
  /** Shorter label for the mobile tab bar. */
  tabLabel: string
  icon: LucideIcon
  roles: UserRole[]
}

const managers: UserRole[] = ['admin', 'manager']
const everyone: UserRole[] = ['admin', 'manager', 'cashier']

export const mainNav: NavItem[] = [
  { to: '/', label: 'Paneli', tabLabel: 'Paneli', icon: LayoutDashboard, roles: managers },
  { to: '/arka', label: 'Arka / Shitja', tabLabel: 'Arka', icon: ShoppingCart, roles: everyone },
  { to: '/produktet', label: 'Produktet', tabLabel: 'Produktet', icon: Package, roles: managers },
  { to: '/stoku', label: 'Stoku & Hyrjet', tabLabel: 'Stoku', icon: Truck, roles: managers },
  { to: '/raportet', label: 'Raportet', tabLabel: 'Raportet', icon: ChartColumn, roles: managers },
]

export const settingsNav: NavItem = {
  to: '/cilesimet',
  label: 'Cilësimet',
  tabLabel: 'Cilësimet',
  icon: Settings,
  roles: everyone,
}

export function canAccess(item: Pick<NavItem, 'roles'>, role: UserRole | undefined): boolean {
  return role !== undefined && item.roles.includes(role)
}

/** Where a user lands after login: cashiers go straight to the register. */
export function homePathFor(role: UserRole | undefined): string {
  return role === 'cashier' ? '/arka' : '/'
}

export const roleLabels: Record<UserRole, string> = {
  admin: 'Administrator',
  manager: 'Menaxher',
  cashier: 'Arkëtar',
}
