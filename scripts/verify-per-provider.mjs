#!/usr/bin/env node
/**
 * verify-per-provider.mjs — proves the per-provider rework behaves:
 * one engine, three providers with different (and absent) peak windows.
 *
 * Bundles the pure TypeScript modules with esbuild (the same bundler the
 * package build uses) and asserts the pricing semantics directly.
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'offpeak-verify-'))
const entry = join(dir, 'entry.ts')
writeFileSync(entry, `
export * from ${JSON.stringify(new URL('../src/pricing.ts', import.meta.url).pathname.replace(/^\//u, ''))}
export * from ${JSON.stringify(new URL('../src/defaults.ts', import.meta.url).pathname.replace(/^\//u, ''))}
`)
const out = join(dir, 'entry.mjs')
await build({ entryPoints: [entry], outfile: out, bundle: true, format: 'esm', platform: 'node', target: ['node22'], logLevel: 'error' })
const mod = await import(pathToFileURL(out).href)

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

const { windowKindAt, nextSwitchAt, defaultProviderProfiles, resolveActiveProfile, applySettingsUpdate, defaultOffpeakSettings } = mod

const profiles = defaultProviderProfiles()
const deepseek = profiles.find(p => p.id === 'deepseek-official')
const opencode = profiles.find(p => p.id === 'opencode-go')
const zai = profiles.find(p => p.id === 'zai')

const WEEKDAYS = [1, 2, 3, 4, 5]
// The engine default and the shipped DeepSeek profile are the same two windows.
const dsw = deepseek.peakWindows

check('deepseek ships the two published weekday windows', dsw, [
  { start: '01:00', end: '04:00', days: WEEKDAYS },
  { start: '06:00', end: '10:00', days: WEEKDAYS },
])
check('deepseek is enabled', deepseek.enabled, true)
check('deepseek peaks at 2x', deepseek.peakMultiplier, 2)
check('opencode ships no window (flat rate)', opencode.peakWindows, [])
check('opencode billing disabled', opencode.enabled, false)
check('zai ships its own window (14:00-18:00 UTC+8 = 06:00-10:00 UTC)', zai.peakWindows, [
  { start: '06:00', end: '10:00', days: WEEKDAYS },
])
check('zai peaks at 3x', zai.peakMultiplier, 3)
check('zai is enabled', zai.enabled, true)
check('the two peak providers disagree on the window', JSON.stringify(dsw) !== JSON.stringify(zai.peakWindows), true)

// 2026-09-15 is a Tuesday; 2026-09-19 is a Saturday.
const tue = (hour, minute = 0) => new Date(Date.UTC(2026, 8, 15, hour, minute))
const sat = (hour, minute = 0) => new Date(Date.UTC(2026, 8, 19, hour, minute))

check('zai 07:00Z is peak while deepseek 07:00Z is peak too (overlap)', [
  windowKindAt(tue(7), zai.peakWindows),
  windowKindAt(tue(7), dsw),
], ['peak', 'peak'])
check('zai 02:00Z is off-peak while deepseek 02:00Z is peak', [
  windowKindAt(tue(2), zai.peakWindows),
  windowKindAt(tue(2), dsw),
], ['offpeak', 'peak'])
check('zai 12:00Z is off-peak while deepseek 12:00Z is off-peak', [
  windowKindAt(tue(12), zai.peakWindows),
  windowKindAt(tue(12), dsw),
], ['offpeak', 'offpeak'])

check('deepseek 02:00Z is peak', windowKindAt(tue(2), dsw), 'peak')
check('deepseek 05:00Z is the off-peak gap', windowKindAt(tue(5), dsw), 'offpeak')
check('deepseek 09:00Z is peak', windowKindAt(tue(9), dsw), 'peak')
check('deepseek 16:29Z is off-peak (the retired window)', windowKindAt(tue(16, 29), dsw), 'offpeak')
check('deepseek 16:30Z is off-peak', windowKindAt(tue(16, 30), dsw), 'offpeak')
check('deepseek is off-peak all Saturday', [0, 2, 5, 9, 12, 23].map(hour => windowKindAt(sat(hour), dsw)), Array(6).fill('offpeak'))
check('deepseek switch from 02:00Z is 04:00Z off-peak', nextSwitchAt(tue(2), dsw).at.toISOString(), '2026-09-15T04:00:00.000Z')
check('deepseek switch target is offpeak', nextSwitchAt(tue(2), dsw).to, 'offpeak')
check('deepseek switch from Tue 17:00Z is Wed 01:00Z peak', nextSwitchAt(tue(17), dsw).at.toISOString(), '2026-09-16T01:00:00.000Z')
check('deepseek switch from Fri 17:00Z skips the weekend to Mon 01:00Z', nextSwitchAt(new Date(Date.UTC(2026, 8, 18, 17)), dsw).at.toISOString(), '2026-09-21T01:00:00.000Z')

// OpenCode: a flat-rate provider never reports peak nor a countdown.
check('opencode is never peak', windowKindAt(tue(2), opencode.peakWindows), 'offpeak')
check('opencode has no next switch', nextSwitchAt(tue(2), opencode.peakWindows), null)

// A provider whose window wraps midnight and runs on weekends only.
const wrap = [{ start: '22:00', end: '02:00', days: [6, 7] }]
check('wrap window: Saturday 23:00Z is peak', windowKindAt(sat(23), wrap), 'peak')
check('wrap window: Sunday 01:00Z is still Saturday night', windowKindAt(new Date(Date.UTC(2026, 8, 20, 1)), wrap), 'peak')
check('wrap window: Saturday 03:00Z is off-peak', windowKindAt(sat(3), wrap), 'offpeak')
check('wrap window: Friday 23:00Z is off-peak', windowKindAt(new Date(Date.UTC(2026, 8, 18, 23)), wrap), 'offpeak')
check('wrap window switch from Saturday 23:00Z is Sunday 02:00Z', nextSwitchAt(sat(23), wrap).at.toISOString(), '2026-09-20T02:00:00.000Z')

// Active-provider resolution and the provider-scoped settings write.
const settings = defaultOffpeakSettings()
check('default active provider is deepseek', resolveActiveProfile(settings).id, 'deepseek-official')
const switched = applySettingsUpdate(settings, { field: 'activeProviderId', value: 'opencode-go' })
check('active provider switch resolves opencode', resolveActiveProfile(switched).id, 'opencode-go')
const edited = applySettingsUpdate(settings, {
  field: 'provider',
  value: { ...zai, enabled: true, peakWindows: [{ start: '00:00', end: '08:00' }], inputPricePerM: 0.1 },
})
check('provider edit replaces only the matching profile', edited.providers.length, 3)
check('provider edit completed the omitted day list', edited.providers.find(p => p.id === 'zai').peakWindows, [{ start: '00:00', end: '08:00', days: [] }])
check('provider edit left deepseek untouched', edited.providers.find(p => p.id === 'deepseek-official').peakWindows, dsw)
check('unknown active id falls back to the first provider', resolveActiveProfile({ ...settings, activeProviderId: 'nope' }).id, 'deepseek-official')

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
