import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface FieldProps {
  label?: ReactNode
  /** Rendered on the right of the label row, e.g. a "forgot password" link. */
  labelAside?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  className?: string
  children: ReactNode
}

/** Label + control + hint/error wrapper shared by Input and Select. */
export function Field({ label, labelAside, hint, error, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || labelAside) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={htmlFor} className="text-[13px] font-medium text-[#33413A] md:text-sm">
              {label}
            </label>
          )}
          {labelAside}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-[13px] text-warn-700">{error}</p>
      ) : (
        hint && <p className="text-[13px] text-muted">{hint}</p>
      )}
    </div>
  )
}
