import { useState, type FormEvent } from 'react'
import { LoaderCircle, Plus } from 'lucide-react'
import { Button, Card, Dialog, Input, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { errorMessage } from '@/lib/errors'
import type { Supplier } from '@/types/database'
import { useDeleteSupplier, useSaveSupplier, useSuppliers } from './api'

type Editing = Supplier | 'new' | null

export function SuppliersTab() {
  const suppliers = useSuppliers()
  const remove = useDeleteSupplier()
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)

  function onDelete(s: Supplier) {
    if (!window.confirm(`Fshi furnitorin "${s.name}"?`)) return
    setError(null)
    remove.mutate(s.id, {
      onSuccess: () => setEditing(null),
      onError: (err) =>
        setError(
          (err as { code?: string }).code === '23503'
            ? `"${s.name}" ka hyrje malli të regjistruara dhe nuk mund të fshihet.`
            : errorMessage(err),
        ),
    })
  }

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-[#EEF1EE] p-4">
        <span className="text-sm text-muted">{suppliers.data?.length ?? 0} furnitorë</span>
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
          Furnitor i ri
        </Button>
      </div>
      {error && <p className="mx-4 mt-4 rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      {suppliers.isPending ? (
        <div className="flex justify-center py-14">
          <LoaderCircle className="size-7 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
        </div>
      ) : suppliers.error ? (
        <p className="p-5 text-sm text-warn-700">{errorMessage(suppliers.error)}</p>
      ) : !suppliers.data.length ? (
        <p className="px-4 py-14 text-center text-sm text-muted">Ende nuk ka furnitorë.</p>
      ) : (
        <Table shaded>
          <THead>
            <TR>
              <TH>Emri</TH>
              <TH>NUI</TH>
              <TH>Telefoni</TH>
              <TH num>Afati i pagesës</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {suppliers.data.map((s) => (
              <TR key={s.id} className="cursor-pointer" onClick={() => setEditing(s)}>
                <TD className="font-semibold">{s.name}</TD>
                <TD className="tabular-nums text-muted">{s.nui ?? '—'}</TD>
                <TD className="tabular-nums">{s.phone ? <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()}>{s.phone}</a> : '—'}</TD>
                <TD num>{s.payment_days ? `${s.payment_days} ditë` : 'Kesh'}</TD>
                <TD className="text-right">
                  <span className="text-[13px] font-semibold text-brand-600">Ndrysho</span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {editing !== null && (
        <SupplierDialog
          key={editing === 'new' ? 'new' : editing.id}
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={onDelete}
        />
      )}
    </Card>
  )
}

function SupplierDialog({ supplier, onClose, onDelete }: { supplier: Supplier | null; onClose: () => void; onDelete: (s: Supplier) => void }) {
  const save = useSaveSupplier()
  const [name, setName] = useState(supplier?.name ?? '')
  const [nui, setNui] = useState(supplier?.nui ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [days, setDays] = useState(String(supplier?.payment_days ?? 0))
  const [error, setError] = useState<string | null>(null)

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const d = Number(days || 0)
    if (!name.trim()) return setError('Shkruaj emrin e furnitorit.')
    if (!Number.isInteger(d) || d < 0) return setError('Afati duhet të jetë numër ditësh (0 = kesh).')
    save.mutate(
      { id: supplier?.id, input: { name: name.trim(), nui: nui.trim() || null, phone: phone.trim() || null, payment_days: d } },
      { onSuccess: onClose, onError: (err) => setError(errorMessage(err)) },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={supplier ? 'Ndrysho furnitorin' : 'Furnitor i ri'}
      size="sm"
      footer={
        <>
          {supplier && (
            <Button variant="ghost" className="text-warn-700 hover:text-warn-700" onClick={() => onDelete(supplier)}>
              Fshi
            </Button>
          )}
          <Button variant="secondary" className="ml-auto" onClick={onClose}>
            Anulo
          </Button>
          <Button loading={save.isPending} onClick={() => submit()}>
            Ruaj
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Input label="Emri" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="p.sh. Furnitori SH.P.K." />
        <Input label="NUI" value={nui} onChange={(e) => setNui(e.target.value)} placeholder="Numri unik identifikues" inputMode="numeric" />
        <Input label="Telefoni" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+383 …" inputMode="tel" />
        <Input label="Afati i pagesës (ditë)" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" hint="0 = pagesë me kesh" />
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}
