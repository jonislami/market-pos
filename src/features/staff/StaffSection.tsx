import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Button, Card, Dialog, Input, Table, TBody, TD, TH, THead, Toggle, TR } from '@/components/ui'
import { errorMessage } from '@/lib/errors'
import { parseDecimal } from '@/lib/text'
import type { Staff } from '@/types/database'
import { useSaveStaff, useStaff } from './api'

/** Colours that read well as calendar blocks on white. */
export const STAFF_COLORS = ['#0E6B4E', '#1D4ED8', '#9333EA', '#C2410C', '#BE185D', '#0F766E', '#854D0E', '#475569']

/** Settings → Punëtorët: who does the services, and their commission. */
export function StaffSection() {
  const staff = useStaff()
  const [editing, setEditing] = useState<Staff | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-[17px] font-semibold">Punëtorët</h2>
            <p className="text-[13px] text-muted">Zgjidhen në arkë për çdo shërbim dhe në termine. Nuk kanë nevojë për llogari në aplikacion.</p>
          </div>
          <Button size="sm" className="min-h-10 shrink-0" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
            Punëtor i ri
          </Button>
        </div>
        {staff.isError && <p className="px-5 pb-4 text-sm text-warn-700">{errorMessage(staff.error)}</p>}
        {staff.data?.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted">Ende asnjë punëtor.</p>
        ) : (
          <Table shaded>
            <THead>
              <TR>
                <TH className="pl-5">Emri</TH>
                <TH num>Komisioni</TH>
                <TH>Statusi</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(staff.data ?? []).map((s) => (
                <TR key={s.id}>
                  <TD className="pl-5">
                    <span className="flex items-center gap-2.5 font-semibold">
                      <span className="size-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                      {s.name}
                    </span>
                  </TD>
                  <TD num>{s.commission_pct}%</TD>
                  <TD>{s.active ? <Badge tone="success">Aktiv</Badge> : <Badge>Joaktiv</Badge>}</TD>
                  <TD className="pr-5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                      Ndrysho
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {editing && <StaffDialog staff={editing === 'new' ? null : editing} usedColors={(staff.data ?? []).map((s) => s.color)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function StaffDialog({ staff, usedColors, onClose }: { staff: Staff | null; usedColors: string[]; onClose: () => void }) {
  const save = useSaveStaff()
  const [name, setName] = useState(staff?.name ?? '')
  const [pct, setPct] = useState(String(staff?.commission_pct ?? 0))
  const [color, setColor] = useState(staff?.color ?? STAFF_COLORS.find((c) => !usedColors.includes(c)) ?? STAFF_COLORS[0])
  const [active, setActive] = useState(staff?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const commission = parseDecimal(pct)
    if (!name.trim()) return setError('Shkruaj emrin.')
    if (commission === null || commission < 0 || commission > 100) return setError('Komisioni duhet të jetë nga 0 deri në 100%.')
    save.mutate(
      { id: staff?.id, name: name.trim(), commission_pct: commission, color, active },
      { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={staff ? 'Ndrysho punëtorin' : 'Punëtor i ri'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Anulo
          </Button>
          <Button className="flex-1" loading={save.isPending} onClick={submit}>
            Ruaj
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Emri" placeholder="p.sh. Arta" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input
          label="Komisioni (%)"
          hint="Pjesa e çmimit të shërbimit që i takon punëtorit."
          inputMode="decimal"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="tabular-nums"
        />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Ngjyra në kalendar</legend>
          <div className="flex flex-wrap gap-2">
            {STAFF_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Ngjyra ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className="flex size-10 items-center justify-center rounded-full"
                style={{ background: c, boxShadow: c === color ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : undefined }}
              />
            ))}
          </div>
        </fieldset>
        {staff && <Toggle label="Aktiv" checked={active} onChange={setActive} />}
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}
