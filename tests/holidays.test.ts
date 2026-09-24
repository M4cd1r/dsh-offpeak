/**
 * Provider holiday calendar tests. DeepSeek bills its weekday peak windows
 * "excluding Chinese public holidays", so a listed UTC date is off-peak no
 * matter what the window/day gates say, the next-switch countdown reflects
 * it, and the shipped 2026 snapshot matches the official calendar.
 *
 * Weekday checks (2026): Jan 1 is a Thursday, so Jan 2 / Feb 16 / Apr 6 /
 * May 4 / Jun 19 / Sep 25 / Oct 5 are Mondays or Fridays inside the calendar,
 * and Jan 5 / Apr 7 / May 6 / Jun 22 / Sep 24 / Oct 8 are the adjacent
 * ordinary weekdays around them.
 */
import { describe, expect, it } from 'vitest'
import type { PeakWindowSpec } from '../src/contract.ts'
import { defaultProviderProfiles } from '../src/defaults.ts'
import { msUntilNextSwitch, nextSwitchAt, windowKindAt } from '../src/pricing.ts'

/** DeepSeek's two published weekday peak windows, in UTC. */
const DEEPSEEK_WINDOWS: PeakWindowSpec[] = [
  { start: '01:00', end: '04:00', days: [1, 2, 3, 4, 5] },
  { start: '06:00', end: '10:00', days: [1, 2, 3, 4, 5] },
]

/**
 * The 2026 Chinese public-holiday calendar as UTC dates, written out here
 * independently of the shipped constant so the two can be cross-checked:
 * https://www.timeanddate.com/holidays/china/2026
 */
const CALENDAR_2026: readonly string[] = [
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
]

/** UTC instant on an explicit calendar date. */
const at = (iso: string, hour = 0, minute = 0): Date =>
  new Date(`${iso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)

/** A weekday-only window that wraps past midnight. */
const WRAP: PeakWindowSpec[] = [{ start: '22:00', end: '02:00', days: [1, 2, 3, 4, 5] }]

describe('windowKindAt honors the holiday calendar', () => {
  it('keeps an otherwise-peak weekday off-peak on a listed holiday in each quarter', () => {
    expect(windowKindAt(at('2026-01-02', 2), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('offpeak')
    expect(windowKindAt(at('2026-04-06', 7), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('offpeak')
    expect(windowKindAt(at('2026-05-04', 9), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('offpeak')
    expect(windowKindAt(at('2026-06-19', 2), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('offpeak')
    expect(windowKindAt(at('2026-09-25', 6, 30), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('offpeak')
    expect(windowKindAt(at('2026-10-05', 8), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('offpeak')
  })

  it('keeps the adjacent ordinary weekdays peak', () => {
    expect(windowKindAt(at('2026-01-05', 2), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('peak')
    expect(windowKindAt(at('2026-04-07', 7), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('peak')
    expect(windowKindAt(at('2026-05-06', 9), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('peak')
    expect(windowKindAt(at('2026-06-22', 2), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('peak')
    expect(windowKindAt(at('2026-09-24', 6, 30), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('peak')
    expect(windowKindAt(at('2026-10-08', 8), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('peak')
  })

  it('still classifies the same instants peak without a calendar', () => {
    expect(windowKindAt(at('2026-01-02', 2), DEEPSEEK_WINDOWS)).toBe('peak')
    expect(windowKindAt(at('2026-10-05', 8), DEEPSEEK_WINDOWS, [])).toBe('peak')
  })

  it('ignores weekdays outside the calendar snapshot', () => {
    expect(windowKindAt(at('2026-11-02', 2), DEEPSEEK_WINDOWS, CALENDAR_2026)).toBe('peak')
  })

  it('suppresses a wrap window’s post-midnight hours on a listed holiday', () => {
    expect(windowKindAt(at('2026-09-15', 23), WRAP, ['2026-09-16'])).toBe('peak')
    expect(windowKindAt(at('2026-09-16', 0, 30), WRAP, ['2026-09-16'])).toBe('offpeak')
    expect(windowKindAt(at('2026-09-16', 0, 30), WRAP)).toBe('peak')
  })
})

describe('nextSwitchAt reports the first aggregate change', () => {
  it('does not switch at the shared boundary of adjacent windows', () => {
    const adjacent: PeakWindowSpec[] = [
      { start: '01:00', end: '04:00', days: [1, 2, 3, 4, 5] },
      { start: '04:00', end: '06:00', days: [1, 2, 3, 4, 5] },
    ]
    const next = nextSwitchAt(at('2026-09-15', 2), adjacent)
    expect(next?.at.toISOString()).toBe('2026-09-15T06:00:00.000Z')
    expect(next?.to).toBe('offpeak')
  })

  it('does not switch inside overlapping windows either', () => {
    const overlapping: PeakWindowSpec[] = [
      { start: '01:00', end: '05:00', days: [1, 2, 3, 4, 5] },
      { start: '04:00', end: '06:00', days: [1, 2, 3, 4, 5] },
    ]
    const next = nextSwitchAt(at('2026-09-15', 2), overlapping)
    expect(next?.at.toISOString()).toBe('2026-09-15T06:00:00.000Z')
    expect(next?.to).toBe('offpeak')
  })

  it('does not switch when one window contains another', () => {
    const nested: PeakWindowSpec[] = [
      { start: '01:00', end: '06:00', days: [1, 2, 3, 4, 5] },
      { start: '02:00', end: '03:00', days: [1, 2, 3, 4, 5] },
    ]
    const next = nextSwitchAt(at('2026-09-15', 1, 30), nested)
    expect(next?.at.toISOString()).toBe('2026-09-15T06:00:00.000Z')
    expect(next?.to).toBe('offpeak')
  })
})

describe('nextSwitchAt honors holidays', () => {
  it('skips a whole holiday week to the next ordinary weekday', () => {
    const next = nextSwitchAt(at('2026-09-30', 20), DEEPSEEK_WINDOWS, CALENDAR_2026)
    expect(next?.at.toISOString()).toBe('2026-10-08T01:00:00.000Z')
    expect(next?.to).toBe('peak')
  })

  it('skips a trailing holiday block at the end of a working week', () => {
    const next = nextSwitchAt(at('2026-09-24', 20), DEEPSEEK_WINDOWS, CALENDAR_2026)
    expect(next?.at.toISOString()).toBe('2026-09-28T01:00:00.000Z')
    expect(next?.to).toBe('peak')
  })

  it('reports no switch while inside a holiday', () => {
    const next = nextSwitchAt(at('2026-10-01', 0, 30), DEEPSEEK_WINDOWS, CALENDAR_2026)
    expect(next?.at.toISOString()).toBe('2026-10-08T01:00:00.000Z')
    expect(next?.to).toBe('peak')
  })

  it('switches at the UTC midnight a holiday suppresses a wrap window', () => {
    const next = nextSwitchAt(at('2026-09-15', 23), WRAP, ['2026-09-16'])
    expect(next?.at.toISOString()).toBe('2026-09-16T00:00:00.000Z')
    expect(next?.to).toBe('offpeak')
  })

  it('never switches for a flat-rate provider even with a calendar', () => {
    expect(nextSwitchAt(at('2026-09-15', 2), [], CALENDAR_2026)).toBeNull()
  })

  it('measures the countdown across a holiday week', () => {
    expect(msUntilNextSwitch(at('2026-09-30', 20), DEEPSEEK_WINDOWS, CALENDAR_2026))
      .toBe(173 * 3600_000)
  })
})

describe('shipped provider profiles carry the calendar', () => {
  it('ships the exact 2026 Chinese public-holiday calendar for DeepSeek', async () => {
    const { DEEPSEEK_HOLIDAY_DATES_2026 } = await import('../src/defaults.ts')
    expect([...DEEPSEEK_HOLIDAY_DATES_2026]).toEqual(CALENDAR_2026)
    const deepseek = defaultProviderProfiles().find(provider => provider.id === 'deepseek-official')
    expect(deepseek?.holidays).toEqual(CALENDAR_2026)
  })

  it('gives every other provider an empty holiday list', () => {
    const others = defaultProviderProfiles().filter(provider => provider.id !== 'deepseek-official')
    expect(others).toHaveLength(2)
    for (const provider of others) expect(provider.holidays).toEqual([])
  })

  it('labels only OpenCode Go as the flat subscription provider', () => {
    const opencode = defaultProviderProfiles().find(provider => provider.id === 'opencode-go')
    expect(opencode?.label).toBe('OpenCode Go')
    for (const provider of defaultProviderProfiles()) {
      expect(provider.label.includes('Zen')).toBe(false)
    }
  })
})
