import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cached } from '@/lib/offlineCache'
import { supabase } from '@/lib/supabase'
import type { Appointment, AppointmentStatus, Staff } from '@/types/database'

export const staffKeys = {
  all: ['staff'] as const,
  appointments: (day: string) => ['appointments', day] as const,
  commissions: (from: string, to: string) => ['reports', 'commissions', from, to] as const,
}

/** Table missing (migration 08 not run yet): the salon features stay empty instead of failing. */
const isMissingTable = (code: string | undefined) => code === '42P01' || code === 'PGRST205'

/** Workers of the store, active first. Cached so the register can pick them offline. */
export function useStaff(enabled = true) {
  return useQuery({
    queryKey: staffKeys.all,
    enabled,
    ...cached('staff', async (): Promise<Staff[]> => {
      const { data, error } = await supabase.from('staff').select('id, name, commission_pct, color, active').order('active', { ascending: false }).order('name')
      if (isMissingTable(error?.code)) return []
      if (error) throw error
      return data.map((s) => ({ ...s, commission_pct: Number(s.commission_pct) }))
    }),
  })
}

export function useSaveStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Omit<Staff, 'id'> & { id?: number }) => {
      const { error } = id ? await supabase.from('staff').update(input).eq('id', id) : await supabase.from('staff').insert(input)
      if (isMissingTable(error?.code)) throw new Error('Punëtorët kërkojnë migrimin 08 në Supabase.')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: staffKeys.all }),
  })
}

// ---------- Appointments ----------

const APPOINTMENT_COLUMNS = 'id, staff_id, product_id, customer_name, customer_phone, starts_at, duration_min, status, note'

/** Appointments that start on `day` (YYYY-MM-DD, local time). */
export function useAppointments(day: string) {
  return useQuery({
    queryKey: staffKeys.appointments(day),
    refetchInterval: 60_000,
    queryFn: async (): Promise<Appointment[]> => {
      const start = new Date(`${day}T00:00:00`)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      const { data, error } = await supabase
        .from('appointments')
        .select(APPOINTMENT_COLUMNS)
        .gte('starts_at', start.toISOString())
        .lt('starts_at', end.toISOString())
        .order('starts_at')
      if (isMissingTable(error?.code)) return []
      if (error) throw error
      return data as Appointment[]
    },
  })
}

export type AppointmentInput = Omit<Appointment, 'id' | 'status'> & { id?: number; status?: AppointmentStatus }

export function useSaveAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: AppointmentInput) => {
      const { error } = id ? await supabase.from('appointments').update(input).eq('id', id) : await supabase.from('appointments').insert(input)
      if (isMissingTable(error?.code)) throw new Error('Terminet kërkojnë migrimin 08 në Supabase.')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

export function useSetAppointmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: AppointmentStatus }) => {
      const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

// ---------- Commission report ----------

export interface CommissionRow {
  staff_id: number
  name: string
  lines: number
  revenue: number
  commission: number
}

export function useCommissions(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: staffKeys.commissions(from, to),
    enabled,
    queryFn: async (): Promise<CommissionRow[]> => {
      const { data, error } = await supabase.rpc('staff_commissions', { p_from: from, p_to: to })
      if (error?.code === 'PGRST202') return []
      if (error) throw error
      return (data as CommissionRow[]).map((r) => ({ ...r, lines: Number(r.lines), revenue: Number(r.revenue), commission: Number(r.commission) }))
    },
  })
}
