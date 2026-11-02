const longDate = new Intl.DateTimeFormat('sq-AL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const time = new Intl.DateTimeFormat('sq-AL', { hour: '2-digit', minute: '2-digit', hour12: false })

const pad = (n: number) => String(n).padStart(2, '0')

/** "02.11.2026" */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** "Sot, 10:42" / "Dje, 16:20" / "29.10, 09:05" */
export function formatRelativeDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const day = same(d, today) ? 'Sot' : same(d, yesterday) ? 'Dje' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
  return `${day}, ${time.format(d)}`
}

/** Local date as yyyy-mm-dd, for <input type="date">. */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "E hënë, 2 nëntor 2026" */
export function formatLongDate(date: Date = new Date()): string {
  const text = longDate.format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}
