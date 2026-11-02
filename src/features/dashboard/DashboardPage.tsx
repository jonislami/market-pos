import { Link } from 'react-router-dom'
import { Plus, ShoppingCart } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ComingSoon } from '@/components/ComingSoon'
import { buttonClasses } from '@/components/ui'
import { formatLongDate } from '@/lib/date'

export function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow={formatLongDate()}
        title="Paneli i ditës"
        actions={
          <>
            <Link to="/stoku" className={buttonClasses({ variant: 'secondary' })}>
              <Plus className="size-4" strokeWidth={2.2} aria-hidden />
              Hyrje malli
            </Link>
            <Link to="/arka" className={buttonClasses()}>
              <ShoppingCart className="size-4" strokeWidth={2.2} aria-hidden />
              Shitje e re
            </Link>
          </>
        }
      />
      <ComingSoon phase={5}>Shitjet e ditës, grafiku i 7 ditëve, më të shiturat, stoku i ulët dhe faturat e fundit.</ComingSoon>
    </>
  )
}
