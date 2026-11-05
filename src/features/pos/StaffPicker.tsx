import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import type { Staff } from '@/types/database'

const KEY = 'market-pos.pos-staff'

/** Worker that new cart lines get; remembered on this device (one chair, one worker). */
export function useCurrentStaff(staff: Staff[]): [number | null, (id: number | null) => void] {
  const [id, setId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(KEY)
      return v ? Number(v) : null
    } catch {
      return null
    }
  })

  // Forget a worker who was removed or deactivated.
  useEffect(() => {
    if (id !== null && staff.length && !staff.some((s) => s.id === id)) setId(null)
  }, [id, staff])

  const set = (next: number | null) => {
    setId(next)
    try {
      if (next === null) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, String(next))
    } catch {
      // Not critical.
    }
  }
  return [id, set]
}

/** Chips to choose who is serving; new lines in the cart are credited to them. */
export function StaffPicker({ staff, value, onChange }: { staff: Staff[]; value: number | null; onChange: (id: number | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Punëtori" className="flex items-center gap-2 overflow-x-auto py-1">
      <span className="shrink-0 text-xs font-semibold text-muted">Punëtori:</span>
      {staff.map((s) => {
        const active = s.id === value
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? null : s.id)}
            className={cn(
              'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
              active ? 'border-transparent text-white' : 'border-line bg-white text-ink hover:bg-[#F7F9F7]',
            )}
            style={active ? { background: s.color } : undefined}
          >
            {!active && <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />}
            {s.name}
          </button>
        )
      })}
    </div>
  )
}
