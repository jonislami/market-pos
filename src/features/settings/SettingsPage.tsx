import { LogOut } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ComingSoon } from '@/components/ComingSoon'
import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'

export function SettingsPage() {
  const { signOut } = useAuth()
  return (
    <>
      <PageHeader title="Cilësimet" subtitle="Menaxho dyqanin, printerin, faturën dhe përdoruesit" />
      <ComingSoon phase={6}>Të dhënat e dyqanit, printeri Bluetooth, pamja e faturës, përdoruesit dhe arkat.</ComingSoon>
      {/* The sidebar has a sign-out button; phones need one here. */}
      <Button variant="secondary" className="md:hidden" icon={<LogOut className="size-4" aria-hidden />} onClick={() => void signOut()}>
        Dil
      </Button>
    </>
  )
}
