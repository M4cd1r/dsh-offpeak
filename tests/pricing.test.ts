/**
 * Pricing engine tests: window boundaries, weekday gating, switch times, and
 * the display helpers the status pill renders.
 *
 * Every shipped provider bills peak hours Monday–Friday only, so the engine
 * classifies an instant by *both* its UTC time of day and its UTC day of week.
 */
import { describe, expect, it } from 'vitest'
import type { OffpeakDay, PeakWindowSpec } from '../src/contract.ts'
import {
  DEEPSEEK_PEAK_WINDOWS,
  NEXT_PEAK_START_MINUTES,
  PEAK_END_MINUTES,
  PEAK_START_MINUTES,
  everyDay,
  formatDays,
  formatDuration,
  formatWallClock,
  formatWindows,
  msUntilNextSwitch,
  multiplierFor,
  nextSwitchAt,
  parseDays,
  utcMinutesOf,
  windowKindAt,
} from '../src/pricing.ts'

/**
 * Build a Date at a given UTC wall time on 2026-03-15, a **Sunday**.
 * Sunday fixtures prove the weekday gate: no shipped provider peaks then.
 */
function utc(hour: number, minute = 0, second = 0, ms = 0): Date {
  return new Date(Date.UTC(2026, 2, 15, hour, minute, second, ms))
}

/** Build a Date at a UTC wall time on an explicit day. 2026-09-15 is a Tuesday. */
function utcOn(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute))
}

/** Tuesday 2026-09-15, the canonical weekday fixture. */
function tue(hour: number, minute = 0): Date {
  return utcOn(2026, 9, 15, hour, minute)
}

/** The shipped weekday qualifier, written out for readability. */
const WEEKDAYS: OffpeakDay[] = [1, 2, 3, 4, 5]

/** DeepSeek's two published weekday peak windows, in UTC. */
const DEEPSEEK_WINDOWS: PeakWindowSpec[] = [
  { start: '01:00', end: '04:00', days: WEEKDAYS },
  { start: '06:00', end: '10:00', days: WEEKDAYS },
]

/** Z.ai's GLM Coding Plan peak window: 14:00–18:00 UTC+8 = 06:00–10:00 UTC. */
const ZAI_WINDOWS: PeakWindowSpec[] = [{ start: '06:00', end: '10:00', days: WEEKDAYS }]

describe('parseDays', () => {
  it('parses a weekday range', () => {
    expect(parseDays('Mon-Fri')).toEqual([1, 2, 3, 4, 5])
  })

  it('parses a weekend range', () => {
    expect(parseDays('Sat-Sun')).toEqual([6, 7])
  })

  it('parses a comma-separated list in the given order', () => {
    expect(parseDays('Mon,Wed,Fri')).toEqual([1, 3, 5])
  })

  it('parses a wrapped range as the tail of the week', () => {
    expect(parseDays('Fri-Mon')).toEqual([1, 5, 6, 7])
  })

  it('accepts full day names and mixed case', () => {
    expect(parseDays('monday-FRIDAY')).toEqual([1, 2, 3, 4, 5])
  })

  it('accepts a single day name', () => {
    expect(parseDays('Sun')).toEqual([7])
  })

  it('rejects an unknown day name', () => {
    expect(parseDays('Funday')).toBeUndefined()
  })

  it('rejects an empty day expression', () => {
    expect(parseDays('   ')).toBeUndefined()
  })
})

describe('formatDays', () => {
  it('renders the weekday qualifier compactly', () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe('Mon-Fri')
  })

  it('renders a full week as every day', () => {
    expect(formatDays(everyDay())).toBe('every day')
  })

  it('renders an empty list as every day', () => {
    expect(formatDays([])).toBe('every day')
  })

  it('round-trips through parseDays', () => {
    const lists: OffpeakDay[][] = [[1, 2, 3, 4, 5], [1, 3, 5], [6, 7], [2], [1, 5, 6, 7]]
    for (const days of lists) {
      expect(parseDays(formatDays(days))).toEqual(days)
    }
  })
})

describe('windowKindAt on the shipped DeepSeek windows', () => {
  it('classifies a Tuesday inside the first window as peak', () => {
    expect(windowKindAt(tue(2, 0), DEEPSEEK_WINDOWS)).toBe('peak')
  })

  it('classifies the gap between the two windows as off-peak', () => {
    expect(windowKindAt(tue(5, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })

  it('classifies a Tuesday inside the second window as peak', () => {
    expect(windowKindAt(tue(9, 59), DEEPSEEK_WINDOWS)).toBe('peak')
  })

  it('classifies the evening after the second window as off-peak', () => {
    expect(windowKindAt(tue(10, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
    expect(windowKindAt(tue(23, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })

  it('keeps Saturday off-peak inside a weekday peak hour', () => {
    expect(windowKindAt(utcOn(2026, 9, 19, 2, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })

  it('keeps Sunday off-peak inside a weekday peak hour', () => {
    expect(windowKindAt(utcOn(2026, 9, 20, 9, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })
})

describe('windowKindAt boundaries', () => {
  it('classifies off-peak one millisecond before the window opens', () => {
    expect(windowKindAt(tue(0, 59), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })

  it('starts peak exactly at the window start', () => {
    expect(windowKindAt(tue(1, 0), DEEPSEEK_WINDOWS)).toBe('peak')
  })

  it('keeps peak until one millisecond before the window ends', () => {
    expect(windowKindAt(utcOn(2026, 9, 15, 3, 59), DEEPSEEK_WINDOWS)).toBe('peak')
  })

  it('starts off-peak exactly at the window end', () => {
    expect(windowKindAt(tue(4, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })

  it('treats midnight as off-peak', () => {
    expect(windowKindAt(tue(0, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })
})

describe('window days default', () => {
  it('treats a window without a day list as every day', () => {
    expect(windowKindAt(utc(12, 0), [{ start: '11:00', end: '13:00' }])).toBe('peak')
  })

  it('honours an explicit day list on a custom window', () => {
    const weekendOnly: PeakWindowSpec[] = [{ start: '11:00', end: '13:00', days: [6, 7] }]
    expect(windowKindAt(utc(12, 0), weekendOnly)).toBe('peak')
    expect(windowKindAt(tue(12, 0), weekendOnly)).toBe('offpeak')
  })

  it('leaves a flat-rate provider off-peak', () => {
    expect(windowKindAt(tue(2, 0), [])).toBe('offpeak')
  })
})

describe('the shipped windows', () => {
  it('ships DeepSeek peak windows as the two published weekday windows', () => {
    expect(DEEPSEEK_PEAK_WINDOWS).toEqual(DEEPSEEK_WINDOWS)
  })

  it('ships Z.ai peak as one weekday window', () => {
    expect(ZAI_WINDOWS).toEqual([{ start: '06:00', end: '10:00', days: [1, 2, 3, 4, 5] }])
  })

  it('keeps the exported boundary constants on the first window', () => {
    expect(PEAK_START_MINUTES).toBe(1 * 60)
    expect(PEAK_END_MINUTES).toBe(4 * 60)
    expect(NEXT_PEAK_START_MINUTES).toBe(6 * 60)
  })

  it('hands overlapping windows only to the provider that publishes them', () => {
    // 07:00 UTC is inside Z.ai's window and DeepSeek's second window.
    expect(windowKindAt(tue(7, 0), ZAI_WINDOWS)).toBe('peak')
    expect(windowKindAt(tue(7, 0), DEEPSEEK_WINDOWS)).toBe('peak')
    // 05:00 UTC is peak for neither.
    expect(windowKindAt(tue(5, 0), ZAI_WINDOWS)).toBe('offpeak')
    expect(windowKindAt(tue(5, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })

  it('leaves the retired 08:30-16:30 window behind', () => {
    expect(windowKindAt(tue(8, 30), DEEPSEEK_WINDOWS)).toBe('peak')
    expect(windowKindAt(tue(12, 0), DEEPSEEK_WINDOWS)).toBe('offpeak')
    expect(windowKindAt(tue(16, 30), DEEPSEEK_WINDOWS)).toBe('offpeak')
  })
})

describe('utcMinutesOf', () => {
  it('counts minutes since UTC midnight', () => {
    expect(utcMinutesOf(utc(0, 0))).toBe(0)
    expect(utcMinutesOf(utc(1, 0))).toBe(PEAK_START_MINUTES)
    expect(utcMinutesOf(utc(4, 0))).toBe(PEAK_END_MINUTES)
    expect(utcMinutesOf(utc(6, 0))).toBe(NEXT_PEAK_START_MINUTES)
    expect(utcMinutesOf(utc(23, 59))).toBe(23 * 60 + 59)
  })
})

describe('multiplierFor', () => {
  it('applies the configured multiplier only in peak', () => {
    expect(multiplierFor('peak', 2)).toBe(2)
    expect(multiplierFor('offpeak', 2)).toBe(1)
    expect(multiplierFor('peak', 3)).toBe(3)
  })
})

describe('nextSwitchAt', () => {
  it('walks from the first window to the gap inside the same day', () => {
    const next = nextSwitchAt(tue(2, 0), DEEPSEEK_WINDOWS)
    expect(next?.to).toBe('offpeak')
    expect(next?.at.toISOString()).toBe('2026-09-15T04:00:00.000Z')
  })

  it('walks from the gap to the second window inside the same day', () => {
    const next = nextSwitchAt(tue(5, 0), DEEPSEEK_WINDOWS)
    expect(next?.to).toBe('peak')
    expect(next?.at.toISOString()).toBe('2026-09-15T06:00:00.000Z')
  })

  it('walks from the second window to off-peak inside the same day', () => {
    const next = nextSwitchAt(tue(9, 0), DEEPSEEK_WINDOWS)
    expect(next?.to).toBe('offpeak')
    expect(next?.at.toISOString()).toBe('2026-09-15T10:00:00.000Z')
  })

  it('skips the weekend by jumping from Friday evening to Monday 01:00', () => {
    const friday = utcOn(2026, 9, 18, 20, 0)
    const next = nextSwitchAt(friday, DEEPSEEK_WINDOWS)
    expect(next?.to).toBe('peak')
    expect(next?.at.toISOString()).toBe('2026-09-21T01:00:00.000Z')
  })

  it('never counts a weekend window when the day list excludes it', () => {
    const saturday = utcOn(2026, 9, 19, 0, 0)
    const next = nextSwitchAt(saturday, DEEPSEEK_WINDOWS)
    expect(next?.at.toISOString()).toBe('2026-09-21T01:00:00.000Z')
  })

  it('is strictly in the future at the exact window start', () => {
    const atStart = tue(1, 0)
    const next = nextSwitchAt(atStart, DEEPSEEK_WINDOWS)
    expect(next?.at.getTime()).toBeGreaterThan(atStart.getTime())
    expect(next?.to).toBe('offpeak')
  })

  it('has no switch for a flat-rate provider', () => {
    expect(nextSwitchAt(tue(2, 0), [])).toBeNull()
  })
})

describe('duration formatting', () => {
  it('formats hours and minutes compactly', () => {
    expect(formatDuration(4 * 3600_000 + 27 * 60_000)).toBe('4h27m')
    expect(formatDuration(3 * 3600_000 + 5 * 60_000)).toBe('3h05m')
  })

  it('formats minutes alone', () => {
    expect(formatDuration(47 * 60_000 + 30_000)).toBe('47m')
  })

  it('formats less than a minute', () => {
    expect(formatDuration(7_000)).toBe('<1m')
    expect(formatDuration(0)).toBe('<1m')
  })

  it('never returns a negative duration', () => {
    expect(formatDuration(-5_000)).toBe('<1m')
  })

  it('msUntilNextSwitch measures to the next boundary', () => {
    // Inside the second window, 08:00 → 10:00 is two hours away.
    expect(msUntilNextSwitch(tue(8, 0), DEEPSEEK_WINDOWS)).toBe(2 * 3600_000)
  })
})

describe('wall-clock formatting', () => {
  it('shifts by the display offset', () => {
    expect(formatWallClock(utc(1, 0), 480)).toBe('09:00')
    expect(formatWallClock(utc(6, 0), 480)).toBe('14:00')
    expect(formatWallClock(utc(1, 5), 0)).toBe('01:05')
  })

  it('renders a window list in the display offset', () => {
    expect(formatWindows(DEEPSEEK_WINDOWS, 480)).toBe('09:00–12:00, 14:00–18:00')
  })

  it('renders the Z.ai window as the same Singapore afternoon', () => {
    expect(formatWindows(ZAI_WINDOWS, 480)).toBe('14:00–18:00')
  })
})
