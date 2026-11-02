import { Store } from 'lucide-react'
import { cn } from '@/lib/cn'

const sizes = {
  sm: { box: 'size-9 rounded-[10px]', icon: 'size-5' },
  md: { box: 'size-11 rounded-xl', icon: 'size-6' },
  lg: { box: 'size-14 rounded-2xl', icon: 'size-7' },
}

/** Green store mark used in the sidebar and on the login screen. */
export function LogoMark({ size = 'sm', className }: { size?: keyof typeof sizes; className?: string }) {
  const s = sizes[size]
  return (
    <div className={cn('flex shrink-0 items-center justify-center bg-brand-400', s.box, className)}>
      <Store className={cn('text-brand-900', s.icon)} strokeWidth={2.2} aria-hidden />
    </div>
  )
}

// Placeholder until store_settings is wired up in Phase 6.
export const STORE_NAME = '[Emri i Marketit]'
