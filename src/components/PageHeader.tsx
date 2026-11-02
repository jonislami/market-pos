import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: ReactNode
  /** Small line above the title (e.g. the date) */
  eyebrow?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, eyebrow, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {eyebrow && <span className="text-[13px] text-muted">{eyebrow}</span>}
        <h1 className="text-2xl font-bold tracking-[-0.02em] md:text-[28px]">{title}</h1>
        {subtitle && <p className="text-sm text-muted md:text-[15px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </header>
  )
}
