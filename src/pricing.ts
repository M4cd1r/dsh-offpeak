/**
 * Pure off-peak pricing engine, parameterised per provider.
 *
 * Every window is a daily `HH:MM`–`HH:MM` range in UTC taken from the active
 * provider's profile, optionally gated to a set of weekdays, so the same engine
 * serves DeepSeek (two weekday windows, ×2), a gateway with its own hours, and
 * a flat-rate gateway with no windows at all. Everything here is a pure
 * function of its inputs — no I/O, no state — so the module the host validates
 * is the same one bundled into the browser, where the status pill derives the
 * window, the countdown, and the effective prices locally.
 */
import type { OffpeakDay, OffpeakWindowKind, PeakWindowSpec } from './contract.ts'

/** Compact labels for the seven days, indexed by `OffpeakDay - 1`. */
const DAY_LABELS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Every day of the week, Monday first — the default when a window names none. */
export function everyDay(): OffpeakDay[] {
  return [1, 2, 3, 4, 5, 6, 7]
}

/**
 * The published DeepSeek window boundaries, kept for docs and defaults: two
 * weekday peak windows, 01:00–04:00 and 06:00–10:00 UTC.
 */
export const WINDOW_BOUNDARIES = {
  peakStartUtc: { hour: 1, minute: 0 },
  peakEndUtc: { hour: 4, minute: 0 },
  nextPeakStartUtc: { hour: 6, minute: 0 },
  nextPeakEndUtc: { hour: 10, minute: 0 },
} as const

/** The first DeepSeek peak window start (01:00 UTC) in minutes since UTC midnight. */
export const PEAK_START_MINUTES = WINDOW_BOUNDARIES.peakStartUtc.hour * 60 + WINDOW_BOUNDARIES.peakStartUtc.minute
/** The first DeepSeek peak window end (04:00 UTC) in minutes since UTC midnight. */
export const PEAK_END_MINUTES = WINDOW_BOUNDARIES.peakEndUtc.hour * 60 + WINDOW_BOUNDARIES.peakEndUtc.minute
/** The second DeepSeek peak window start (06:00 UTC) in minutes since UTC midnight. */
export const NEXT_PEAK_START_MINUTES = WINDOW_BOUNDARIES.nextPeakStartUtc.hour * 60 + WINDOW_BOUNDARIES.nextPeakStartUtc.minute

/** Fractional minutes since UTC midnight for one instant. */
export function utcMinutesOf(date: Date): number {
  return date.getUTCHours() * 60
    + date.getUTCMinutes()
    + date.getUTCSeconds() / 60
    + date.getUTCMilliseconds() / 60_000
}

/** The ISO day of the week (1 = Monday … 7 = Sunday) of a UTC day offset from a base. */
function dayOfWeek(base: Date, dayOffset: number): OffpeakDay {
  const day = (base.getUTCDay() + dayOffset) % 7
  return (day <= 0 ? day + 7 : day) as OffpeakDay
}

/**
 * Parse one `HH:MM` clock string into minutes since midnight.
 * @param value - the raw clock string.
 * @returns minutes, or `undefined` when the string is not a valid clock.
 */
export function parseClock(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim())
  if (match === null) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined
  return hour * 60 + minute
}

/**
 * Parse a day expression: names or abbreviations, single days, `-` ranges and
 * comma-separated lists, e.g. `Mon-Fri`, `Mon,Wed,Fri`, `Sat-Sun`.
 * @param value - the raw day expression.
 * @returns the selected days as ISO numbers (1 = Monday … 7 = Sunday),
 *          ascending and deduplicated, or `undefined` when unrecognised.
 */
export function parseDays(value: string): OffpeakDay[] | undefined {
  const selected = new Set<OffpeakDay>()
  for (const chunk of value.split(',')) {
    const part = chunk.trim()
    if (part === '') continue
    const [first, last, ...rest] = part.split(/[-–]/u)
    if (rest.length > 0 || first === undefined) return undefined
    const from = resolveDay(first)
    const to = last === undefined ? from : resolveDay(last)
    if (from === undefined || to === undefined) return undefined
    for (let day = from; ; day = (day % 7) + 1) {
      selected.add(day as OffpeakDay)
      if (day === to) break
    }
  }
  if (selected.size === 0) return undefined
  return [...selected].sort((left, right) => left - right)
}

/** Resolve one day token (`Mon`, `monday`, `1`, …) to an ISO day number. */
function resolveDay(token: string): OffpeakDay | undefined {
  const text = token.trim().toLowerCase()
  if (/^[1-7]$/u.test(text)) return Number(text) as OffpeakDay
  const index = DAY_LABELS.findIndex(label => label.toLowerCase() === text.slice(0, 3))
  if (index < 0) return undefined
  // A three-letter prefix is a match only when the token is exactly that name
  // or its full form, so `tue` and `tuesday` pass while `tuesx` does not.
  const full = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][index] as string
  if (text !== full && text !== full.slice(0, 3)) return undefined
  return (index + 1) as OffpeakDay
}

/** Format minutes since midnight back into `HH:MM`. */
export function formatClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hour = Math.floor(wrapped / 60)
  const minute = wrapped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * Render a day list as the editable qualifier text: `Mon-Fri`, `Mon,Wed,Fri`,
 * or `every day` for the full week (and for an empty list, which means the
 * same). The output always parses back to the same days.
 * @param days - the selected days.
 * @returns the compact day expression.
 */
export function formatDays(days: readonly OffpeakDay[]): string {
  const sorted = [...new Set(days)].sort((left, right) => left - right)
  if (sorted.length === 0 || sorted.length === 7) return 'every day'
  const windows: string[] = []
  let start = sorted[0] as OffpeakDay
  let previous = start
  for (const day of sorted.slice(1)) {
    if (day === previous + 1) {
      previous = day
      continue
    }
    windows.push(renderDayWindow(start, previous))
    start = day
    previous = day
  }
  windows.push(renderDayWindow(start, previous))
  return windows.join(',')
}

/** Render one consecutive run of days as `Mon-Fri`, `Mon-Tue`, or `Mon`. */
function renderDayWindow(start: OffpeakDay, end: OffpeakDay): string {
  if (start === end) return DAY_LABELS[start - 1] as string
  return `${DAY_LABELS[start - 1]}-${DAY_LABELS[end - 1]}`
}

/**
 * The price factor in force for one window kind.
 * @param kind - the window the instant falls in.
 * @param peakMultiplier - the profile's peak multiplier.
 * @returns the peak multiplier inside a peak window, else 1.
 */
export function multiplierFor(kind: OffpeakWindowKind, peakMultiplier: number): number {
  return kind === 'peak' ? peakMultiplier : 1
}

/** One resolvable window boundary in minutes since midnight. */
interface Boundary {
  readonly minutes: number
  readonly opens: boolean
  readonly days: readonly OffpeakDay[]
  /** Whether the window's own start/end clock wraps past midnight. */
  readonly wraps: boolean
}

/** The usable boundaries of one window; an empty result means the window is inert. */
function boundariesOf(window: PeakWindowSpec): Boundary[] {
  const start = parseClock(window.start)
  const end = parseClock(window.end)
  if (start === undefined || end === undefined || start === end) return []
  const days = window.days ?? []
  return [
    { minutes: start, opens: true, days, wraps: start > end },
    { minutes: end, opens: false, days, wraps: start > end },
  ]
}

/**
 * Every boundary that does fire inside the lookahead, paired with the switch it
 * produces. A boundary whose day is excluded by the window's day list is
 * dropped, so a weekday-only window never reports a Saturday or Sunday switch.
 */
function activeBoundaries(base: Date, windows: readonly PeakWindowSpec[]): { at: Date; opens: boolean }[] {
  const active: { at: Date; opens: boolean }[] = []
  for (const window of windows) {
    for (const boundary of boundariesOf(window)) {
      // A window repeats every seven days, so one cycle either side of the
      // reference instant covers every boundary that can matter.
      for (let dayOffset = -1; dayOffset <= 7; dayOffset += 1) {
        if (!boundaryFiresOn(boundary, dayOfWeek(base, dayOffset))) continue
        active.push({ at: utcDateAtMinutes(base, boundary.minutes, dayOffset), opens: boundary.opens })
      }
    }
  }
  return active
}

/** Whether a boundary is reached on a given day of the week. */
function boundaryFiresOn(boundary: Boundary, day: OffpeakDay): boolean {
  // No day list means the window runs every day.
  if (boundary.days.length === 0) return true
  if (boundary.opens) return boundary.days.includes(day)
  // A window that wraps past midnight ends on the day *after* its start day,
  // so the end boundary is gated by the previous day.
  const startDay = (boundary.wraps ? (day === 1 ? 7 : day - 1) : day) as OffpeakDay
  return boundary.days.includes(startDay)
}

/** Whether one window contains a given minute-of-day (wrap-aware). */
function windowContains(window: PeakWindowSpec, minutes: number): boolean {
  const start = parseClock(window.start)
  const end = parseClock(window.end)
  if (start === undefined || end === undefined || start === end) return false
  if (start < end) return minutes >= start && minutes < end
  // Wraps past midnight, e.g. 22:00 → 02:00.
  return minutes >= start || minutes < end
}

/**
 * The pricing window containing one instant, honouring both the window's clock
 * range and its weekday gate.
 * @param date - the instant to classify.
 * @param windows - the active provider's peak windows (empty ⇒ always off-peak).
 * @returns the window kind.
 */
export function windowKindAt(date: Date, windows: readonly PeakWindowSpec[] = DEEPSEEK_PEAK_WINDOWS): OffpeakWindowKind {
  const minutes = utcMinutesOf(date)
  const today = dayOfWeek(date, 0)
  const yesterday = dayOfWeek(date, -1)
  const inWindow = windows.some((window) => {
    if (!windowContains(window, minutes)) return false
    const days = window.days ?? []
    if (days.length === 0) return true
    const start = parseClock(window.start)
    const end = parseClock(window.end)
    if (start === undefined || end === undefined) return false
    // A window that wraps past midnight belongs to its start day, so the hours
    // after midnight are still the previous day's window.
    const startDay = start > end && minutes < end ? yesterday : today
    return days.includes(startDay)
  })
  return inWindow ? 'peak' : 'offpeak'
}

/** The default DeepSeek window list, used when a caller omits one. */
export const DEEPSEEK_PEAK_WINDOWS: readonly PeakWindowSpec[] = [
  { start: formatClock(PEAK_START_MINUTES), end: formatClock(PEAK_END_MINUTES), days: [1, 2, 3, 4, 5] },
  { start: formatClock(NEXT_PEAK_START_MINUTES), end: formatClock(WINDOW_BOUNDARIES.nextPeakEndUtc.hour * 60 + WINDOW_BOUNDARIES.nextPeakEndUtc.minute), days: [1, 2, 3, 4, 5] },
]

/** Build a Date at a given fractional minutes-since-UTC-midnight value, `dayOffset` days from `base`. */
function utcDateAtMinutes(base: Date, minutes: number, dayOffset: number): Date {
  const whole = Math.floor(minutes)
  const ms = Math.round((minutes - whole) * 1000)
  const date = new Date(base)
  date.setUTCHours(0, whole, 0, ms)
  if (dayOffset !== 0) date.setUTCDate(date.getUTCDate() + dayOffset)
  return date
}

/**
 * The next window switch strictly after `date`, skipping boundaries whose day
 * the window excludes.
 * @param date - the reference instant.
 * @param windows - the active provider's peak windows.
 * @returns the switch instant and the window that begins there, or `null` when
 *          the provider declares no windows (a flat rate never switches).
 */
export function nextSwitchAt(
  date: Date,
  windows: readonly PeakWindowSpec[] = DEEPSEEK_PEAK_WINDOWS,
): { at: Date; to: OffpeakWindowKind } | null {
  const candidates = activeBoundaries(date, windows)
  if (candidates.length === 0) return null
  let best: { at: Date; to: OffpeakWindowKind } | undefined
  for (const candidate of candidates) {
    if (candidate.at.getTime() <= date.getTime()) continue
    if (best !== undefined && candidate.at.getTime() >= best.at.getTime()) continue
    best = { at: candidate.at, to: candidate.opens ? 'peak' : 'offpeak' }
  }
  return best ?? null
}

/**
 * Milliseconds until the next window switch, or `null` for a flat-rate profile.
 * @param now - the reference instant.
 * @param windows - the active provider's peak windows.
 * @returns the positive delay, or `null` when no switch is ever scheduled.
 */
export function msUntilNextSwitch(now: Date, windows: readonly PeakWindowSpec[] = DEEPSEEK_PEAK_WINDOWS): number | null {
  const next = nextSwitchAt(now, windows)
  if (next === null) return null
  return Math.max(1, next.at.getTime() - now.getTime())
}

/** Format a duration for display at minute precision, compact style: `4h27m`, `47m`, or `<1m`. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000)
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h${String(minutes).padStart(2, '0')}m`
  }
  if (totalMinutes > 0) return `${totalMinutes}m`
  return '<1m'
}

/**
 * Format a wall-clock time in the configured display offset.
 * @param date - the instant (UTC-based engine).
 * @param utcOffsetMinutes - display offset, e.g. 480 for UTC+8.
 */
export function formatWallClock(date: Date, utcOffsetMinutes: number): string {
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60_000)
  const hours = shifted.getUTCHours()
  const minutes = shifted.getUTCMinutes()
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Render one provider's window list for display, in the configured offset.
 * @param windows - the provider's UTC windows.
 * @param utcOffsetMinutes - display offset.
 * @returns a compact `09:00–12:00, 14:00–18:00` style summary, or the empty string.
 */
export function formatWindows(windows: readonly PeakWindowSpec[], utcOffsetMinutes: number): string {
  return formatWindowSpecs(windows, utcOffsetMinutes, false)
}

/**
 * Render one provider's window list together with its weekday qualifier.
 * @param windows - the provider's UTC windows.
 * @param utcOffsetMinutes - display offset.
 * @returns a compact `Mon-Fri 09:00–12:00, 14:00–18:00` style summary.
 */
export function formatWindowsWithDays(windows: readonly PeakWindowSpec[], utcOffsetMinutes: number): string {
  return formatWindowSpecs(windows, utcOffsetMinutes, true)
}

/** Render a window list in the display offset, optionally with its day qualifier. */
function formatWindowSpecs(
  windows: readonly PeakWindowSpec[],
  utcOffsetMinutes: number,
  withDays: boolean,
): string {
  const parts: string[] = []
  let qualifier: string | undefined
  for (const window of windows) {
    const start = parseClock(window.start)
    const end = parseClock(window.end)
    if (start === undefined || end === undefined || start === end) continue
    const range = `${formatWallClock(utcDateAtMinutes(new Date(0), start, 0), utcOffsetMinutes)}–${formatWallClock(utcDateAtMinutes(new Date(0), end, 0), utcOffsetMinutes)}`
    if (!withDays) {
      parts.push(range)
      continue
    }
    const days = window.days ?? []
    const next = days.length > 0 && days.length < 7 ? formatDays(days) : undefined
    if (next === undefined) {
      qualifier = undefined
      parts.push(range)
      continue
    }
    if (qualifier === next) parts.push(range)
    else parts.push(`${next} ${range}`)
    qualifier = next
  }
  return parts.join(', ')
}
