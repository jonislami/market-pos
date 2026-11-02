// Albanian names are spelled out here: many browsers ship without "sq" locale data
// and Intl silently falls back to English.
const WEEKDAYS_LONG = ['e diel', 'e hënë', 'e martë', 'e mërkurë', 'e enjte', 'e premte', 'e shtunë']
const MONTHS_LONG = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor']

const pad = (n: number) => String(n).padStart(2, '0')

/** "10:42" (24h) */
export function formatTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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
  return `${day}, ${formatTime(d)}`
}

/** Local date as yyyy-mm-dd, for <input type="date">. */
export function todayISO(): string {
  return toISODate(new Date())
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parses yyyy-mm-dd as a local date (not UTC midnight). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

const WEEKDAYS_SHORT = ['Die', 'Hën', 'Mar', 'Mër', 'Enj', 'Pre', 'Sht']
const MONTHS_SHORT = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj']

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[fromISODate(iso).getDay()]
}

export function monthShort(monthIndex: number): string {
  return MONTHS_SHORT[monthIndex]
}

const WEEKDAY_ACCUSATIVE = ['e diela', 'e hëna', 'e marta', 'e mërkura', 'e enjtja', 'e premtja', 'e shtuna']

/** "e hëna" – used in "nga e hëna e kaluar". */
export function weekdayName(iso: string): string {
  return WEEKDAY_ACCUSATIVE[fromISODate(iso).getDay()]
}

/** "E hënë, 2 nëntor 2026" */
export function formatLongDate(date: Date = new Date()): string {
  const text = `${WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
