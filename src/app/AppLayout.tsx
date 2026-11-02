import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      {/* Bottom padding leaves room for the fixed tab bar on phones. */}
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 pb-28 md:p-8">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
