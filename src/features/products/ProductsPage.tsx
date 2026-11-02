import { PageHeader } from '@/components/PageHeader'
import { ComingSoon } from '@/components/ComingSoon'

export function ProductsPage() {
  return (
    <>
      <PageHeader title="Produktet" subtitle="Produktet dhe kategoritë e dyqanit" />
      <ComingSoon phase={2}>Lista me filtra, formulari i produktit, kategoritë dhe importi nga Excel.</ComingSoon>
    </>
  )
}
