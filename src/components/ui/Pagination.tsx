import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  className?: string
}

/** Page numbers around the current one, with gaps: 1 … 4 5 6 … 20 */
function pageList(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap')
    out.push(p)
  })
  return out
}

const btn = 'flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[13px] tabular-nums'

export function Pagination({ page, pageSize, total, onChange, className }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted', className)}>
      <span>
        Duke shfaqur {from}–{to} nga {total}
      </span>
      {pages > 1 && (
        <nav aria-label="Faqet" className="flex gap-1.5">
          <button
            type="button"
            aria-label="Faqja e mëparshme"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            className={cn(btn, 'border border-field bg-white text-ink disabled:opacity-40')}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          {pageList(page, pages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className={cn(btn, 'min-w-6')}>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onChange(p)}
                className={cn(
                  btn,
                  p === page ? 'bg-ink font-semibold text-white' : 'border border-field bg-white text-ink hover:bg-[#F0F3F1]',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Faqja tjetër"
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
            className={cn(btn, 'border border-field bg-white text-ink disabled:opacity-40')}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  )
}
