import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Scroll container + table. Use `shaded` for the grey header row (Produktet). */
export function Table({ className, shaded, ...rest }: HTMLAttributes<HTMLTableElement> & { shaded?: boolean }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse text-sm',
          shaded && '[&_tbody_tr:hover]:bg-[#F7FBF9] [&_th]:bg-[#F7F9F7]',
          className,
        )}
        {...rest}
      />
    </div>
  )
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}

export function TR(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />
}

interface CellAlign {
  /** Right-aligned tabular numbers. */
  num?: boolean
}

export function TH({ num, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & CellAlign) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-line px-3 py-2.5 text-left text-xs font-semibold text-muted',
        num && 'text-right',
        className,
      )}
      {...rest}
    />
  )
}

export function TD({ num, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & CellAlign) {
  return (
    <td
      className={cn('whitespace-nowrap border-b border-[#EEF1EE] p-3', num && 'text-right tabular-nums', className)}
      {...rest}
    />
  )
}
