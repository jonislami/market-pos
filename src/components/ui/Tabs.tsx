import { cn } from '@/lib/cn'

export interface TabItem<T extends string> {
  value: T
  label: string
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  /** `segmented`: pill switch (login, Javë/Muaj/Vit). `underline`: page tabs (Stoku). */
  variant?: 'segmented' | 'underline'
  label?: string
  className?: string
}

export function Tabs<T extends string>({ items, value, onChange, variant = 'underline', label, className }: TabsProps<T>) {
  const segmented = variant === 'segmented'
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        segmented ? 'grid auto-cols-fr grid-flow-col rounded-xl bg-[#E7ECE8] p-1' : 'flex overflow-x-auto border-b border-line',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'min-h-btn whitespace-nowrap text-sm transition-colors',
              segmented
                ? cn(
                    'rounded-[9px] px-3',
                    active ? 'bg-white font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.1)]' : 'font-medium text-muted',
                  )
                : cn(
                    '-mb-px border-b-2 px-4',
                    active
                      ? 'border-brand-600 font-semibold text-ink'
                      : 'border-transparent font-medium text-muted hover:text-ink',
                  ),
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
