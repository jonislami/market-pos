import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'critical' | 'low' | 'success' | 'neutral' | 'info'

const tones: Record<BadgeTone, string> = {
  critical: 'bg-warn-100 text-warn-700',
  low: 'bg-amber-100 text-amber-700',
  success: 'bg-brand-100 text-brand-600',
  neutral: 'bg-[#EEF1EE] text-muted',
  info: 'bg-[#E0E7FF] text-bt-600',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Shows a small leading dot, e.g. "• I palidhur". */
  dot?: boolean
}

export function Badge({ tone = 'neutral', dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}
