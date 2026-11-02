import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  /** `row`: label left, checkbox right with a divider (settings). `inline`: checkbox then label (login). */
  layout?: 'row' | 'inline'
  disabled?: boolean
  className?: string
}

export function Toggle({ checked, onChange, label, description, layout = 'inline', disabled, className }: ToggleProps) {
  const id = useId()
  const box = (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="size-5 shrink-0 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
    />
  )

  if (layout === 'row') {
    return (
      <label
        htmlFor={id}
        className={cn('flex min-h-[52px] cursor-pointer items-center justify-between gap-4 border-t border-line py-2', className)}
      >
        <span className="flex flex-col">
          <span className="text-sm font-semibold">{label}</span>
          {description && <span className="text-xs text-muted">{description}</span>}
        </span>
        {box}
      </label>
    )
  }

  return (
    <label htmlFor={id} className={cn('flex min-h-btn cursor-pointer items-center gap-2.5 text-sm', className)}>
      {box}
      <span>{label}</span>
    </label>
  )
}
