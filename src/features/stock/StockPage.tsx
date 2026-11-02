import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { ComingSoon } from '@/components/ComingSoon'
import { Tabs } from '@/components/ui'

type StockTab = 'entry' | 'history' | 'movements' | 'inventory' | 'suppliers'

const tabs: { value: StockTab; label: string }[] = [
  { value: 'entry', label: 'Hyrje e re' },
  { value: 'history', label: 'Historiku i hyrjeve' },
  { value: 'movements', label: 'Lëvizjet e stokut' },
  { value: 'inventory', label: 'Inventarizimi' },
  { value: 'suppliers', label: 'Furnitorët' },
]

export function StockPage() {
  const [tab, setTab] = useState<StockTab>('entry')
  return (
    <>
      <PageHeader title="Stoku & Hyrjet" subtitle="Hyrjet e mallit nga furnitorët dhe lëvizjet e stokut" />
      <Tabs items={tabs} value={tab} onChange={setTab} label="Seksionet e stokut" />
      <ComingSoon phase={4} />
    </>
  )
}
