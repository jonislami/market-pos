import { Construction } from 'lucide-react'
import { Card } from '@/components/ui'

/** Placeholder body for screens that are built in later phases. */
export function ComingSoon({ phase, children }: { phase: number; children?: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-16 text-center">
      <Construction className="size-10 text-muted" aria-hidden />
      <p className="text-base font-semibold">Ky ekran ndërtohet në Fazën {phase}</p>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
    </Card>
  )
}
