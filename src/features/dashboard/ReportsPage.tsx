import { PageHeader } from '@/components/PageHeader'
import { ComingSoon } from '@/components/ComingSoon'

export function ReportsPage() {
  return (
    <>
      <PageHeader title="Raportet" subtitle="Shitjet, fitimi dhe TVSH sipas periudhës" />
      <ComingSoon phase={5} />
    </>
  )
}
