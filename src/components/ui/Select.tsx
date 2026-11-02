import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Field } from './Field'
import { controlBase, controlSizes, type ControlSize } from './Input'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  size?: ControlSize
  options?: SelectOption[]
  wrapperClassName?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, size = 'md', options, children, className, wrapperClassName, id, ...rest },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId} className={wrapperClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(controlBase, controlSizes[size], 'appearance-none pr-9', error && 'border-warn-700', className)}
          {...rest}
        >
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink" aria-hidden />
      </div>
    </Field>
  )
})
