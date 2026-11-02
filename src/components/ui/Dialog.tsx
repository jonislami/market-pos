import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Max width on desktop; phones always get a bottom sheet. */
  size?: 'sm' | 'md' | 'lg'
}

const widths = { sm: 'md:max-w-sm', md: 'md:max-w-lg', lg: 'md:max-w-3xl' }

export function CloseButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Mbyll"
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#F0F3F1] text-muted hover:text-ink', className)}
    >
      <X className="size-[18px]" aria-hidden />
    </button>
  )
}

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: DialogProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-[#10241B]/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-[20px] bg-white shadow-xl md:rounded-card',
          widths[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
          <h2 id={titleId} className="text-[17px] font-bold">
            {title}
          </h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div className="flex gap-2.5 border-t border-line px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
