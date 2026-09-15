#!/usr/bin/env node
/**
 * verify-schedule.mjs — proves the peak/off-peak schedule matches what DeepSeek
 * and Z.ai publish, using the real TypeScript modules through Node's native
 * type stripping (no bundler, no test runner).
 *
 * Published schedules:
 *   DeepSeek  peak 01:00-04:00 and 06:00-10:00 UTC, Monday-Friday, ×2.
 *             https://api-docs.deepseek.com/quick_start/pricing
 *   Z.ai      peak 14:00-18:00 UTC+8 (06:00-10:00 UTC), Monday-Friday, ×3.
 *             https://docs.z.ai/devpack/overview
 *
 * Fixture days: 2026-09-14 Mon, 09-15 Tue, 09-18 Fri, 09-19 Sat, 09-20 Sun,
 * 09-21 Mon.
 */
import {
  DEEPSEEK_PEAK_WINDOWS,
  NEXT_PEAK_START_MINUTES,
  PEAK_END_MINUTES,
  PEAK_START_MINUTES,
  everyDay,
  formatDays,
  formatWindows,
  formatWindowsWithDays,
  msUntilNextSwitch,
  nextSwitchAt,
  parseDays,
  windowKindAt,
} from '../src/pricing.ts'
import {
  DEEPSEEK_PEAK_WINDOWS as DEFAULT_DEEPSEEK_WINDOWS,
  ZAI_PEAK_WINDOWS,
  defaultProviderProfiles,
  defaultOffpeakSettings,
  resolveActiveProfile,
} from '../src/defaults.ts'

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

/** UTC instant on an explicit day. */
const at = (day, hour, minute = 0) => new Date(Date.UTC(2026, 8, day, hour, minute))

const WEEKDAYS = [1, 2, 3, 4, 5]
const DSW = [
  { start: '01:00', end: '04:00', days: WEEKDAYS },
  { start: '06:00', end: '10:00', days: WEEKDAYS },
]
const ZAI = [{ start: '06:00', end: '10:00', days: WEEKDAYS }]

console.log('--- day expressions ---')
check('Mon-Fri parses to the working week', parseDays('Mon-Fri'), WEEKDAYS)
check('Sat-Sun parses to the weekend', parseDays('Sat-Sun'), [6, 7])
check('a list keeps ISO order', parseDays('Fri,Mon,Wed'), [1, 3, 5])
check('a wrapped range is the tail of the week', parseDays('Fri-Mon'), [1, 5, 6, 7])
check('full names and case are accepted', parseDays('monday-FRIDAY'), WEEKDAYS)
check('an unknown name is rejected', parseDays('Funday'), undefined)
check('an empty expression is rejected', parseDays('  '), undefined)
check('the weekday qualifier renders compactly', formatDays(WEEKDAYS), 'Mon-Fri')
check('the full week renders as every day', formatDays(everyDay()), 'every day')
check('an empty day list renders as every day', formatDays([]), 'every day')
check('formatDays round-trips', [[1, 3, 5], [6, 7], [2], WEEKDAYS].map(days => parseDays(formatDays(days))), [[1, 3, 5], [6, 7], [2], WEEKDAYS])

console.log('\n--- DeepSeek: two weekday windows (01:00-04:00, 06:00-10:00 UTC) ---')
check('Tue 00:59 is off-peak', windowKindAt(at(15, 0, 59), DSW), 'offpeak')
check('Tue 01:00 is peak', windowKindAt(at(15, 1, 0), DSW), 'peak')
check('Tue 03:59 is peak', windowKindAt(at(15, 3, 59), DSW), 'peak')
check('Tue 04:00 is off-peak (the lunch gap)', windowKindAt(at(15, 4, 0), DSW), 'offpeak')
check('Tue 05:59 is off-peak', windowKindAt(at(15, 5, 59), DSW), 'offpeak')
check('Tue 06:00 is peak again', windowKindAt(at(15, 6, 0), DSW), 'peak')
check('Tue 09:59 is peak', windowKindAt(at(15, 9, 59), DSW), 'peak')
check('Tue 10:00 is off-peak', windowKindAt(at(15, 10, 0), DSW), 'offpeak')
check('Tue 16:30 is off-peak (the retired window is gone)', windowKindAt(at(15, 16, 30), DSW), 'offpeak')
check('Tue 12:00 is off-peak (no midday peak any more)', windowKindAt(at(15, 12, 0), DSW), 'offpeak')

console.log('\n--- weekday gate: weekends are off-peak for both providers ---')
for (const [label, day] of [['Sat', 19], ['Sun', 20]]) {
  check(`${label} 02:00 is off-peak`, windowKindAt(at(day, 2, 0), DSW), 'offpeak')
  check(`${label} 08:00 is off-peak`, windowKindAt(at(day, 8, 0), DSW), 'offpeak')
  check(`${label} 08:00 is off-peak for Z.ai`, windowKindAt(at(day, 8, 0), ZAI), 'offpeak')
}
check('Mon 01:00 is peak (the week opens)', windowKindAt(at(14, 1, 0), DSW), 'peak')
check('Mon 01:00 is peak for Z.ai? no — 09:00 Beijing', windowKindAt(at(14, 1, 0), ZAI), 'offpeak')

console.log('\n--- Z.ai: one weekday window (14:00-18:00 UTC+8) ---')
check('Tue 05:59 is off-peak', windowKindAt(at(15, 5, 59), ZAI), 'offpeak')
check('Tue 06:00 is peak', windowKindAt(at(15, 6, 0), ZAI), 'peak')
check('Tue 09:59 is peak', windowKindAt(at(15, 9, 59), ZAI), 'peak')
check('Tue 10:00 is off-peak', windowKindAt(at(15, 10, 0), ZAI), 'offpeak')
check('the window is 14:00-18:00 in the display offset', formatWindows(ZAI, 480), '14:00–18:00')
check('DeepSeek renders as two Beijing windows', formatWindows(DEEPSEEK_PEAK_WINDOWS, 480), '09:00–12:00, 14:00–18:00')
check('the weekday qualifier shows in the detailed form', formatWindowsWithDays(DEEPSEEK_PEAK_WINDOWS, 480), 'Mon-Fri 09:00–12:00, 14:00–18:00')
check('Z.ai keeps its own single window in the detailed form', formatWindowsWithDays(ZAI, 480), 'Mon-Fri 14:00–18:00')

console.log('\n--- switch times ---')
check('Tue 02:00 switches to off-peak at 04:00Z', nextSwitchAt(at(15, 2), DSW)?.at.toISOString(), '2026-09-15T04:00:00.000Z')
check('...and the switch target is off-peak', nextSwitchAt(at(15, 2), DSW)?.to, 'offpeak')
check('Tue 05:00 switches to peak at 06:00Z', nextSwitchAt(at(15, 5), DSW)?.at.toISOString(), '2026-09-15T06:00:00.000Z')
check('Tue 08:00 switches to off-peak at 10:00Z', nextSwitchAt(at(15, 8), DSW)?.at.toISOString(), '2026-09-15T10:00:00.000Z')
check('Fri 20:00 skips the weekend to Mon 01:00Z', nextSwitchAt(at(18, 20), DSW)?.at.toISOString(), '2026-09-21T01:00:00.000Z')
check('Sat 00:00 skips the weekend to Mon 01:00Z', nextSwitchAt(at(19, 0), DSW)?.at.toISOString(), '2026-09-21T01:00:00.000Z')
check('Sun 23:00 skips to Mon 01:00Z', nextSwitchAt(at(20, 23), DSW)?.at.toISOString(), '2026-09-21T01:00:00.000Z')
check('the switch at the exact boundary is strictly later', nextSwitchAt(at(15, 1), DSW)?.to, 'offpeak')
check('2h from Tue 02:00 to the 04:00 end of window one', msUntilNextSwitch(at(15, 2), DSW), 2 * 3600_000)
check('6h from Tue 04:00 to the 10:00 end of window two', msUntilNextSwitch(at(15, 6), DSW), 4 * 3600_000)
check('a flat-rate provider never switches', nextSwitchAt(at(15, 2), []), null)

console.log('\n--- wrap-past-midnight windows still work ---')
const wrap = [{ start: '22:00', end: '01:00', days: WEEKDAYS }]
check('Mon 23:00 is peak', windowKindAt(at(14, 23), wrap), 'peak')
check('Tue 00:30 is still Monday night: peak', windowKindAt(at(15, 0, 30), wrap), 'peak')
check('Tue 01:00 is off-peak (the window ended)', windowKindAt(at(15, 1, 0), wrap), 'offpeak')
check('Sat 00:30 belongs to Friday night: peak', windowKindAt(at(19, 0, 30), wrap), 'peak')
check('...and the Monday-weekend gate holds: Sun 00:30 is off-peak', windowKindAt(at(20, 0, 30), wrap), 'offpeak')
check('Fri 23:00 is peak', windowKindAt(at(18, 23), wrap), 'peak')
check('Fri 22:00 switches to off-peak at Sat 01:00Z', nextSwitchAt(at(18, 22), wrap)?.at.toISOString(), '2026-09-19T01:00:00.000Z')

console.log('\n--- shipped defaults match the published schedules ---')
check('the engine default is the two-window weekday list', DEEPSEEK_PEAK_WINDOWS, DSW)
const profiles = defaultProviderProfiles()
const deepseek = profiles.find(p => p.id === 'deepseek-official')
const zai = profiles.find(p => p.id === 'zai')
const opencode = profiles.find(p => p.id === 'opencode-go')
check('the DeepSeek profile ships the two published windows', deepseek.peakWindows, DSW)
check('the DeepSeek profile keeps the exported list', DEFAULT_DEEPSEEK_WINDOWS, DSW)
check('DeepSeek peaks at 2x', deepseek.peakMultiplier, 2)
check('DeepSeek ships the official flash off-peak prices', [deepseek.inputPricePerM, deepseek.cacheHitPricePerM, deepseek.outputPricePerM], [0.15, 0.003, 0.6])
check('the Z.ai profile ships the SGT afternoon window', zai.peakWindows, ZAI)
check('the Z.ai profile keeps the exported list', ZAI_PEAK_WINDOWS, ZAI)
check('Z.ai peaks at 3x', zai.peakMultiplier, 3)
check('OpenCode ships no window (flat rate)', opencode.peakWindows, [])
check('the two peak providers disagree on the window', JSON.stringify(deepseek.peakWindows) !== JSON.stringify(zai.peakWindows), true)
check('the boundary constants describe the first window', [PEAK_START_MINUTES, PEAK_END_MINUTES, NEXT_PEAK_START_MINUTES], [60, 240, 360])
check('the default active provider is DeepSeek', resolveActiveProfile(defaultOffpeakSettings()).id, 'deepseek-official')

console.log('\n--- legacy settings without a day list stay every-day ---')
const legacy = {
  ...defaultOffpeakSettings(),
  providers: [{ ...deepseek, peakWindows: [{ start: '08:30', end: '16:30' }] }],
  activeProviderId: 'deepseek-official',
}
const resolvedLegacy = resolveActiveProfile(legacy)
check('an omitted day list resolves to every day', resolvedLegacy.peakWindows, [{ start: '08:30', end: '16:30', days: [] }])
check('...so a Saturday inside it is peak', windowKindAt(at(19, 12, 0), resolvedLegacy.peakWindows), 'peak')

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
