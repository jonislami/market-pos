import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Field } from './Field'

export type ControlSize = 'md' | 'lg'

export const controlSizes: Record<ControlSize, string> = {
  md: 'min-h-btn rounded-[10px] text-sm',
  lg: 'min-h-[52px] rounded-xl text-base',
}

export const controlBase =
  'w-full border border-field bg-white px-3 text-ink placeholder:text-[#8A968F] ' +
  'focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 ' +
  'disabled:bg-[#F0F3F1] disabled:text-muted'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode
  labelAside?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  size?: ControlSize
  leftIcon?: ReactNode
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, labelAside, hint, error, size = 'md', leftIcon, className, wrapperClassName, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <Field label={label} labelAside={labelAside} hint={hint} error={error} htmlFor={inputId} className={wrapperClassName}>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">{leftIcon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            controlBase,
            controlSizes[size],
            size === 'lg' && 'px-3.5',
            leftIcon && 'pl-10',
            error && 'border-warn-700',
            className,
          )}
          {...rest}
        />
      </div>
    </Field>
  )
})
