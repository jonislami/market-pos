import { Outlet } from 'react-router-dom'
import { OfflineBanner } from './OfflineBanner'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg">
      {/* Solid strip behind the phone status bar (white text): content scrolling under it stays hidden instead of showing through blurred. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-brand-900 md:hidden" />
      <Sidebar />
      {/* Bottom padding leaves room for the fixed tab bar on phones; top padding clears the status bar. */}
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 pb-28 pt-[calc(env(safe-area-inset-top)+16px)] md:p-8">
        <OfflineBanner />
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
