import { Store } from 'lucide-react'
import { cn } from '@/lib/cn'
import { buildReceiptLines, charsPerLine, type ReceiptData } from '@/lib/printer/receipt'

/**
 * The receipt as the thermal printer lays it out (same lines, same column widths), in IBM Plex Mono.
 * Used for the settings preview and for printing through the browser when Bluetooth is unavailable.
 */
export function ReceiptView({ data, className }: { data: ReceiptData; className?: string }) {
  const width = charsPerLine(data.store.paper_width)
  return (
    // Outer box carries padding/background; the inner one is exactly one printer line wide.
    <div className={cn('w-fit bg-white font-mono text-[12px] leading-[1.55] text-black', className)}>
      <div style={{ width: `${width}ch` }}>
      {buildReceiptLines(data).map((l, i) => {
        switch (l.kind) {
          case 'logo':
            return (
              <div key={i} className="flex justify-center pb-2">
                <span className="flex size-11 items-center justify-center rounded-xl border-2 border-black">
                  <Store className="size-5" aria-hidden />
                </span>
              </div>
            )
          case 'rule':
            return <div key={i} className="my-1.5 border-t border-dashed border-black" />
          case 'space':
            return <div key={i} className="h-2" />
          case 'barcode':
            return <Barcode key={i} value={l.data} />
          case 'text':
            if (l.big) {
              // "TOTALI EUR      10.70": label at normal size, amount enlarged (double height on paper).
              const [label, amount] = l.text.split(/ {2,}/)
              return (
                <div key={i} className="flex items-baseline justify-between font-semibold">
                  <span>{label}</span>
                  <span className="text-[1.6em] leading-tight">{amount}</span>
                </div>
              )
            }
            return (
              <div
                key={i}
                className={cn('whitespace-pre-wrap', l.bold && 'font-semibold')}
                style={{ textAlign: l.align ?? 'left' }}
              >
                {l.text}
              </div>
            )
        }
      })}
      </div>
    </div>
  )
}

/** Decorative stand-in for the CODE128 printed by the thermal printer. */
function Barcode({ value }: { value: string }) {
  const bars = [...value].flatMap((c) => {
    const n = c.charCodeAt(0)
    return [1 + (n % 3), 1 + ((n >> 1) % 2), 2 + (n % 2), 1 + ((n >> 2) % 3)]
  })
  return (
    <div className="flex flex-col items-center gap-0.5 pt-2">
      <div className="flex h-10 items-stretch">
        {[2, 1, 1, ...bars, 2, 1, 1].map((w, i) => (
          <span key={i} style={{ width: w * 1.5 }} className={i % 2 === 0 ? 'bg-black' : 'bg-transparent'} />
        ))}
      </div>
      <span className="text-[11px]">{value}</span>
    </div>
  )
}
