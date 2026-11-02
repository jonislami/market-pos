import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Button, Card, Dialog, Input, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { getDeviceStoreId } from '@/lib/deviceStore'
import { errorMessage } from '@/lib/errors'
import { useCreateStore, useSetStoreActive, useStores } from './api'

/** Platform admin only: every market on this installation. */
export function StoresSection() {
  const stores = useStores()
  const setActive = useSetStoreActive()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = getDeviceStoreId()

  function toggle(id: string, active: boolean) {
    setError(null)
    setActive.mutate({ id, active }, { onError: (e) => setError(errorMessage(e)) })
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-2 text-[13px] text-muted">
        <p>
          Çdo dyqan ka produktet, stokun, shitjet dhe përdoruesit e vet – askush nuk sheh të dhënat e dyqanit tjetër.
        </p>
        <p>
          Për dyqan të ri: krijo së pari pronarin te Supabase → Authentication → Users (email + fjalëkalim), kopjo UID-në,
          pastaj shtyp "Dyqan i ri". Pronari hyn me email dhe shton vetë arkëtarët e tij.
        </p>
      </Card>

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <h2 className="text-[17px] font-semibold">Dyqanet</h2>
          <Button size="sm" className="min-h-10" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
            Dyqan i ri
          </Button>
        </div>
        {stores.isError && <p className="px-5 pb-4 text-sm text-warn-700">{errorMessage(stores.error)}</p>}
        {error && <p className="px-5 pb-4 text-sm text-warn-700">{error}</p>}
        <Table shaded>
          <THead>
            <TR>
              <TH className="pl-5">Emri</TH>
              <TH className="text-right">Përdorues</TH>
              <TH className="text-right">Shitje</TH>
              <TH>Statusi</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {(stores.data ?? []).map((s) => (
              <TR key={s.id}>
                <TD className="pl-5 font-semibold">
                  {s.name}
                  {s.id === current && <span className="ml-2 text-xs font-normal text-muted">(ky dyqan)</span>}
                </TD>
                <TD className="text-right tabular-nums">{s.users}</TD>
                <TD className="text-right tabular-nums">{s.sales}</TD>
                <TD>{s.active ? <Badge tone="success">Aktiv</Badge> : <Badge>Joaktiv</Badge>}</TD>
                <TD className="pr-5 text-right">
                  {s.id !== current && (
                    <Button variant="ghost" size="sm" disabled={setActive.isPending} onClick={() => toggle(s.id, !s.active)}>
                      {s.active ? 'Çaktivizo' : 'Aktivizo'}
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {adding && <AddStoreDialog onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddStoreDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateStore()
  const [name, setName] = useState('')
  const [uid, setUid] = useState('')
  const [owner, setOwner] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    if (!name.trim()) return setError('Shkruaj emrin e dyqanit.')
    if (!/^[0-9a-f-]{36}$/i.test(uid.trim())) return setError('UID duhet të jetë si 1a2b3c4d-....-.... (36 karaktere).')
    if (!owner.trim()) return setError('Shkruaj emrin e pronarit.')
    create.mutate(
      { name: name.trim(), ownerId: uid.trim(), ownerName: owner.trim() },
      { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Dyqan i ri"
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Anulo
          </Button>
          <Button className="flex-1" loading={create.isPending} onClick={submit}>
            Krijo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Emri i dyqanit" placeholder="p.sh. Market Dardania" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input label="UID e pronarit (nga Supabase)" placeholder="1a2b3c4d-…" value={uid} onChange={(e) => setUid(e.target.value)} className="font-mono text-[13px]" />
        <Input label="Emri i pronarit" placeholder="p.sh. Arben Krasniqi" value={owner} onChange={(e) => setOwner(e.target.value)} />
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}
