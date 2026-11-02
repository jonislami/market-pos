import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ReportsPage } from '@/features/dashboard/ReportsPage'
import { PosPage } from '@/features/pos/PosPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { StockPage } from '@/features/stock/StockPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import type { UserRole } from '@/types/database'
import { AppLayout } from './AppLayout'
import { AuthGuard } from './AuthGuard'

const managers: UserRole[] = ['admin', 'manager']

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <AuthGuard roles={managers}><DashboardPage /></AuthGuard> },
      { path: 'arka', element: <PosPage /> },
      { path: 'produktet', element: <AuthGuard roles={managers}><ProductsPage /></AuthGuard> },
      { path: 'stoku', element: <AuthGuard roles={managers}><StockPage /></AuthGuard> },
      { path: 'raportet', element: <AuthGuard roles={managers}><ReportsPage /></AuthGuard> },
      { path: 'cilesimet', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
