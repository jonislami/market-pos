import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { router } from '@/app/router'
import { startOfflineSync } from '@/features/pos/offlineSales'
import { autoReconnect } from '@/lib/printer/bluetooth'
import { PrintArea } from '@/lib/printer/print'
import './index.css'

autoReconnect()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

startOfflineSync(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <PrintArea />
    </QueryClientProvider>
  </StrictMode>,
)
