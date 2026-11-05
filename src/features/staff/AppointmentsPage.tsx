import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock, Phone, Plus, ShoppingCart } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card, Dialog, Input, Select, type BadgeTone } from '@/components/ui'
import { usePosProducts } from '@/features/pos/api'
import { addToStoredCart } from '@/features/pos/cart'
import { cn } from '@/lib/cn'
import { addDays, formatDate, formatTime, todayISO, toISODate } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import type { Appointment, AppointmentStatus, PosProduct, Staff } from '@/types/database'
import { useAppointments, useSaveAppointment, useSetAppointmentStatus, useStaff } from './api'

const DAY_START = 8 // 08:00
const DAY_END = 21 // 21:00
const PX_PER_MIN = 1.2
const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240]

const STATUS: Record<AppointmentStatus, { label: string; tone: BadgeTone }> = {
  booked: { label: 'I rezervuar', tone: 'neutral' },
  done: { label: 'I kryer', tone: 'success' },
  cancelled: { label: 'I anuluar', tone: 'critical' },
  no_show: { label: 'Nuk erdhi', tone: 'low' },
}

const minutesOfDay = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

const durationLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} orë${m % 60 ? ` ${m % 60} min` : ''}`)

type Editing = { appointment: Appointment | null; staffId: number | null; time: string } | null

/** Salon calendar: one column per worker (desktop), a timeline list on phones. */
export function AppointmentsPage() {
  const [day, setDay] = useState(todayISO)
  const appointments = useAppointments(day)
  const staffQuery = useStaff()
  const products = usePosProducts()
  const [editing, setEditing] = useState<Editing>(null)

  const staff = useMemo(() => (staffQuery.data ?? []).filter((s) => s.active), [staffQuery.data])
  const services = useMemo(() => (products.data ?? []).filter((p) => p.kind === 'service'), [products.data])
  const serviceName = (id: number | null) => services.find((s) => s.id === id)?.name ?? ''
  const list = appointments.data ?? []
  const visible = list.filter((a) => a.status !== 'cancelled')
  // Appointments without a worker get their own column, only when there are some.
  const columns: (Staff | null)[] = [...staff, ...(visible.some((a) => !a.staff_id || !staff.some((s) => s.id === a.staff_id)) ? [null] : [])]
  const isToday = day === todayISO()

  const open = (appointment: Appointment | null, staffId: number | null = null, time = '') =>
    setEditing({ appointment, staffId, time: time || defaultTime(day) })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Terminet"
        subtitle={`${visible.length} termine · ${formatDate(day)}`}
        actions={
          <Button icon={<Plus className="size-5" aria-hidden />} onClick={() => open(null)}>
            Termin i ri
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="size-11 px-0" aria-label="Dita e kaluar" onClick={() => setDay((d) => addDays(d, -1))}>
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <Button variant={isToday ? 'primary' : 'secondary'} onClick={() => setDay(todayISO())}>
          Sot
        </Button>
        <Button variant="secondary" className="size-11 px-0" aria-label="Dita tjetër" onClick={() => setDay((d) => addDays(d, 1))}>
          <ChevronRight className="size-5" aria-hidden />
        </Button>
        <Input type="date" aria-label="Data" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} wrapperClassName="w-[170px]" />
      </div>

      {appointments.isError && <Card className="text-sm text-warn-700">{errorMessage(appointments.error)}</Card>}
      {staffQuery.data?.length === 0 && (
        <Card className="text-sm text-muted">
          Shto punëtorët te <strong>Cilësimet → Punëtorët &amp; Komisioni</strong>, që terminet të ndahen sipas punëtorit.
        </Card>
      )}

      {/* ===== Desktop: day grid ===== */}
      <Card padded={false} className="hidden overflow-x-auto md:block">
        <div className="flex min-w-fit">
          <div className="w-14 shrink-0 border-r border-line pt-11">
            {hours().map((h) => (
              <div key={h} className="relative text-right text-[11px] tabular-nums text-muted" style={{ height: 60 * PX_PER_MIN }}>
                <span className="absolute -top-2 right-2">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>
          {(columns.length ? columns : [null]).map((col) => {
            const items = visible.filter((a) => (col ? a.staff_id === col.id : !a.staff_id || !staff.some((s) => s.id === a.staff_id)))
            return (
              <div key={col?.id ?? 'none'} className="min-w-[180px] flex-1 border-r border-line last:border-r-0">
                <div className="flex h-11 items-center gap-2 border-b border-line px-3 text-sm font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: col?.color ?? '#CBD5CE' }} aria-hidden />
                  {col?.name ?? 'Pa punëtor'}
                </div>
                <div className="relative" style={{ height: (DAY_END - DAY_START) * 60 * PX_PER_MIN }}>
                  {hours().map((h, i) => (
                    <button
                      key={h}
                      type="button"
                      aria-label={`Termin i ri ${h}:00${col ? ` – ${col.name}` : ''}`}
                      onClick={() => open(null, col?.id ?? null, `${String(h).padStart(2, '0')}:00`)}
                      className="absolute inset-x-0 border-t border-[#EEF1EE] hover:bg-brand-100/40"
                      style={{ top: i * 60 * PX_PER_MIN, height: 60 * PX_PER_MIN }}
                    />
                  ))}
                  {items.map((a) => {
                    const top = Math.max(minutesOfDay(a.starts_at) - DAY_START * 60, 0) * PX_PER_MIN
                    const color = col?.color ?? '#56645C'
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => open(a)}
                        className={cn(
                          'absolute inset-x-1 flex flex-col overflow-hidden rounded-lg border-l-4 bg-white px-2 py-1 text-left text-xs shadow-[0_1px_3px_rgba(0,0,0,.12)]',
                          a.status !== 'booked' && 'opacity-60',
                        )}
                        style={{ top, height: Math.max(a.duration_min * PX_PER_MIN, 26), borderLeftColor: color }}
                      >
                        <span className="truncate font-semibold">
                          {formatTime(a.starts_at)} {a.customer_name}
                        </span>
                        <span className="truncate text-muted">{serviceName(a.product_id) || durationLabel(a.duration_min)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ===== Phone: list ===== */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {list.length === 0 && !appointments.isPending && <p className="py-10 text-center text-sm text-muted">Asnjë termin për këtë ditë.</p>}
        {list.map((a) => {
          const worker = staff.find((s) => s.id === a.staff_id)
          return (
            <button key={a.id} type="button" onClick={() => open(a)} className="text-left">
              <Card className={cn('flex items-center gap-3 border-l-4', a.status === 'cancelled' && 'opacity-60')} style={{ borderLeftColor: worker?.color ?? '#CBD5CE' }}>
                <div className="flex w-14 shrink-0 flex-col">
                  <span className="text-lg font-bold tabular-nums">{formatTime(a.starts_at)}</span>
                  <span className="text-xs text-muted">{durationLabel(a.duration_min)}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{a.customer_name}</span>
                  <span className="truncate text-sm text-muted">
                    {[serviceName(a.product_id), worker?.name].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
                {a.status !== 'booked' && <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>}
              </Card>
            </button>
          )
        })}
      </div>

      {editing && (
        <AppointmentDialog
          day={day}
          editing={editing}
          staff={staff}
          services={services}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function hours(): number[] {
  return Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
}

/** Next half hour today, otherwise 09:00. */
function defaultTime(day: string): string {
  if (day !== todayISO()) return '09:00'
  const d = new Date()
  const m = Math.min(Math.ceil((d.getHours() * 60 + d.getMinutes()) / 30) * 30, (DAY_END - 1) * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function AppointmentDialog({
  day,
  editing,
  staff,
  services,
  onClose,
}: {
  day: string
  editing: NonNullable<Editing>
  staff: Staff[]
  services: PosProduct[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const save = useSaveAppointment()
  const setStatus = useSetAppointmentStatus()
  const a = editing.appointment
  const [name, setName] = useState(a?.customer_name ?? '')
  const [phone, setPhone] = useState(a?.customer_phone ?? '')
  const [serviceId, setServiceId] = useState(a?.product_id ? String(a.product_id) : '')
  const [staffId, setStaffId] = useState(String(a?.staff_id ?? editing.staffId ?? ''))
  const [date, setDate] = useState(a ? toISODate(new Date(a.starts_at)) : day)
  const [time, setTime] = useState(a ? formatTime(a.starts_at) : editing.time)
  const [duration, setDuration] = useState(String(a?.duration_min ?? 30))
  const [note, setNote] = useState(a?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const service = services.find((s) => String(s.id) === serviceId)

  function chooseService(id: string) {
    setServiceId(id)
    const s = services.find((x) => String(x.id) === id)
    if (s?.duration_min) setDuration(String(s.duration_min))
  }

  function submit() {
    setError(null)
    if (!name.trim()) return setError('Shkruaj emrin e klientit.')
    if (!/^\d{2}:\d{2}$/.test(time)) return setError('Zgjidh orën.')
    save.mutate(
      {
        id: a?.id,
        customer_name: name.trim(),
        customer_phone: phone.trim() || null,
        product_id: serviceId ? Number(serviceId) : null,
        staff_id: staffId ? Number(staffId) : null,
        starts_at: new Date(`${date}T${time}:00`).toISOString(),
        duration_min: Number(duration),
        note: note.trim() || null,
      },
      { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) },
    )
  }

  function changeStatus(status: AppointmentStatus) {
    if (!a) return
    setStatus.mutate({ id: a.id, status }, { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) })
  }

  /** Puts the service in the register's cart with the worker, marks the appointment done. */
  function pay() {
    if (!a || !service) return
    addToStoredCart({ productId: service.id, qty: 1, staffId: staffId ? Number(staffId) : null })
    setStatus.mutate({ id: a.id, status: 'done' })
    navigate('/arka')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={a ? 'Termini' : 'Termin i ri'}
      size="md"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Mbyll
          </Button>
          <Button className="flex-1" loading={save.isPending} onClick={submit}>
            Ruaj
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {a && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
            {a.customer_phone && (
              <a href={`tel:${a.customer_phone}`} className="flex items-center gap-1 text-sm font-semibold">
                <Phone className="size-4" aria-hidden />
                {a.customer_phone}
              </a>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Klienti" placeholder="Emri dhe mbiemri" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!a} />
          <Input label="Telefoni" placeholder="+383 ..." inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Select label="Shërbimi" value={serviceId} onChange={(e) => chooseService(e.target.value)}>
            <option value="">Pa shërbim të caktuar</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatMoney(s.sale_price)}
              </option>
            ))}
          </Select>
          <Select label="Punëtori" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Pa punëtor</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input label="Data" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ora" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
            <Select label="Zgjat" value={duration} onChange={(e) => setDuration(e.target.value)} options={DURATIONS.map((m) => ({ value: String(m), label: durationLabel(m) }))} />
          </div>
        </div>
        <Input label="Shënim" placeholder="p.sh. ngjyrë e njëjtë si herën e kaluar" value={note} onChange={(e) => setNote(e.target.value)} />

        {a && a.status === 'booked' && (
          <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Clock className="size-3.5" aria-hidden />
              Pas terminit
            </span>
            <div className="flex flex-wrap gap-2">
              {service && (
                <Button size="sm" className="min-h-10" icon={<ShoppingCart className="size-4" aria-hidden />} onClick={pay}>
                  Paguaj në arkë
                </Button>
              )}
              <Button variant="secondary" size="sm" className="min-h-10" onClick={() => changeStatus('done')}>
                I kryer
              </Button>
              <Button variant="secondary" size="sm" className="min-h-10" onClick={() => changeStatus('no_show')}>
                Nuk erdhi
              </Button>
              <Button variant="secondary" size="sm" className="min-h-10 text-warn-700" onClick={() => changeStatus('cancelled')}>
                Anulo terminin
              </Button>
            </div>
          </div>
        )}
        {a && a.status !== 'booked' && (
          <Button variant="secondary" size="sm" className="min-h-10 self-start" onClick={() => changeStatus('booked')}>
            Rikthe si të rezervuar
          </Button>
        )}
        {error && <p className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
      </div>
    </Dialog>
  )
}
