import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'bluetooth' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-[#0A5039] hover:text-white',
  secondary: 'border border-field bg-white text-ink hover:bg-[#F0F3F1] hover:text-ink',
  ghost: 'bg-transparent text-ink hover:bg-[#F0F3F1] hover:text-ink',
  dark: 'bg-ink text-white hover:bg-black hover:text-white',
  bluetooth: 'bg-bt-600 text-white hover:bg-[#1E40AF] hover:text-white',
  danger: 'bg-warn-700 text-white hover:bg-[#7C2D12] hover:text-white',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-3 text-[13px] rounded-lg',
  md: 'min-h-btn px-[18px] text-sm rounded-[10px]',
  lg: 'min-h-[54px] px-6 text-base font-bold rounded-xl',
}

interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  className?: string
}

/** Button classes, also usable on <Link> elements. */
export function buttonClasses({ variant = 'primary', size = 'md', block, className }: ButtonStyleOptions = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 font-semibold no-underline transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, className, loading, icon, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})
