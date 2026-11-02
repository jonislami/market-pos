import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui'
import type { UserRole } from '@/types/database'
import { homePathFor } from './nav'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <LoaderCircle className="size-8 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
    </div>
  )
}

function NoProfile() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <CircleAlert className="size-10 text-warn-700" aria-hidden />
        <h1 className="text-xl font-bold">Llogaria nuk është aktive</h1>
        <p className="text-sm text-muted">
          Kjo llogari nuk ka profil aktiv në dyqan. Kontakto administratorin që të të caktojë një rol.
        </p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Dil
        </Button>
      </div>
    </div>
  )
}

/** Requires a signed-in user with an active profile; optionally restricts by role. */
export function AuthGuard({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile || !profile.active) return <NoProfile />
  if (roles && !roles.includes(profile.role)) return <Navigate to={homePathFor(profile.role)} replace />

  return <>{children}</>
}
