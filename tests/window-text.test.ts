/**
 * Tests for the editable peak-window text the settings section round-trips:
 * a day qualifier followed by one or more `HH:MM-HH:MM` ranges, e.g.
 * `Mon-Fri 01:00-04:00, 06:00-10:00`. Malformed input must be rejected rather
 * than silently saved as a window with no days.
 */
import { describe, expect, it } from 'vitest'
import { textToWindows, windowsToText } from '../src/client/OffpeakSettings.tsx'
import type { OffpeakDay, PeakWindowSpec } from '../src/contract.ts'

const WEEKDAYS: OffpeakDay[] = [1, 2, 3, 4, 5]

describe('textToWindows', () => {
  it('parses a day qualifier sharing one or more ranges', () => {
    expect(textToWindows('Mon-Fri 01:00-04:00, 06:00-10:00')).toEqual([
      { start: '01:00', end: '04:00', days: WEEKDAYS },
      { start: '06:00', end: '10:00', days: WEEKDAYS },
    ])
  })

  it('lets a later qualifier override the earlier one', () => {
    expect(textToWindows('Mon-Fri 01:00-04:00, Sat-Sun 06:00-10:00')).toEqual([
      { start: '01:00', end: '04:00', days: WEEKDAYS },
      { start: '06:00', end: '10:00', days: [6, 7] },
    ])
  })

  it('accepts a range with no qualifier as every day', () => {
    expect(textToWindows('08:30-16:30')).toEqual([{ start: '08:30', end: '16:30', days: [] }])
  })

  it('accepts the spelled-out every-day qualifier', () => {
    expect(textToWindows('every day 08:30-16:30')).toEqual([{ start: '08:30', end: '16:30', days: [] }])
  })

  it('accepts an en dash between clocks', () => {
    expect(textToWindows('Mon-Fri 09:00–12:00')).toEqual([{ start: '09:00', end: '12:00', days: WEEKDAYS }])
  })

  it('returns an empty list for empty input (a flat rate)', () => {
    expect(textToWindows('   ')).toEqual([])
  })

  it('rejects an unknown day name', () => {
    expect(textToWindows('Funday 01:00-04:00')).toBeUndefined()
  })

  it('rejects a malformed clock', () => {
    expect(textToWindows('Mon-Fri 25:00-04:00')).toBeUndefined()
    expect(textToWindows('Mon-Fri 1:0-4:00')).toBeUndefined()
  })

  it('rejects a bare day list with no range', () => {
    expect(textToWindows('Mon-Fri')).toBeUndefined()
  })

  it('rejects trailing garbage', () => {
    expect(textToWindows('Mon-Fri 01:00-04:00 tomorrow')).toBeUndefined()
  })
})

describe('windowsToText', () => {
  it('groups ranges that share a day list behind one qualifier', () => {
    const windows: PeakWindowSpec[] = [
      { start: '01:00', end: '04:00', days: WEEKDAYS },
      { start: '06:00', end: '10:00', days: WEEKDAYS },
    ]
    expect(windowsToText(windows)).toBe('Mon-Fri 01:00-04:00, 06:00-10:00')
  })

  it('omits the qualifier for an every-day window', () => {
    expect(windowsToText([{ start: '08:30', end: '16:30', days: [] }])).toBe('08:30-16:30')
  })

  it('starts a new group when the day list changes', () => {
    const windows: PeakWindowSpec[] = [
      { start: '01:00', end: '04:00', days: WEEKDAYS },
      { start: '06:00', end: '10:00', days: [6, 7] },
    ]
    expect(windowsToText(windows)).toBe('Mon-Fri 01:00-04:00, Sat-Sun 06:00-10:00')
  })

  it('round-trips every shipped provider window list', () => {
    const shipped: PeakWindowSpec[][] = [
      [
        { start: '01:00', end: '04:00', days: WEEKDAYS },
        { start: '06:00', end: '10:00', days: WEEKDAYS },
      ],
      [{ start: '06:00', end: '10:00', days: WEEKDAYS }],
      [],
      [{ start: '08:30', end: '16:30', days: [] }],
      [{ start: '22:00', end: '01:00', days: [6, 7] }],
    ]
    for (const windows of shipped) {
      expect(textToWindows(windowsToText(windows))).toEqual(windows)
    }
  })
})
