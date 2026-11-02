const longDate = new Intl.DateTimeFormat('sq-AL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** "E hënë, 2 nëntor 2026" */
export function formatLongDate(date: Date = new Date()): string {
  const text = longDate.format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}
