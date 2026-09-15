/**
 * Runtime integration tests: OffpeakRuntime wired to a real cordis Context
 * with a scripted settings scope. The service is the whole host surface —
 * two Remote methods over the durable pricing preferences.
 *
 * The service also completes what it reads: a window persisted before the
 * weekday gate existed carries no `days` key, and the wire must still deliver
 * a list the browser can index.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { OffpeakRuntime } from '../src/runtime.ts'
import { DEEPSEEK_PROVIDER_ID, defaultOffpeakSettings } from '../src/defaults.ts'
import type { OffpeakSettings } from '../src/contract.ts'

/** Scripted settings scope (get/update only — all the runtime uses). */
function fakeSettingsScope(initial: OffpeakSettings): SettingsScope<OffpeakSettings> {
  let current = initial
  return {
    get: () => current,
    update: async (patch: object) => { current = { ...current, ...patch } },
    watch: () => () => {},
    replace: async (section: object) => { current = { ...defaultOffpeakSettings(), ...section } },
  }
}

/** A runtime over a fresh default section, plus the scope holding its state. */
function makeRuntime(initial: OffpeakSettings = defaultOffpeakSettings()): {
  runtime: OffpeakRuntime
  scope: SettingsScope<OffpeakSettings>
} {
  const scope = fakeSettingsScope(initial)
  return { runtime: new OffpeakRuntime(new Context(), scope), scope }
}

describe('OffpeakRuntime', () => {
  it('reads the resolved settings', async () => {
    const { runtime } = makeRuntime()
    const settings = await runtime.getSettings()
    expect(settings.enabled).toBe(true)
    expect(settings.currency).toBe('USD')
    expect(settings.activeProviderId).toBe(DEEPSEEK_PROVIDER_ID)
  })

  it('ships the published DeepSeek schedule and prices', async () => {
    const { runtime } = makeRuntime()
    const deepseek = (await runtime.getSettings()).providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.peakMultiplier).toBe(2)
    expect(deepseek?.peakWindows).toEqual([
      { start: '01:00', end: '04:00', days: [1, 2, 3, 4, 5] },
      { start: '06:00', end: '10:00', days: [1, 2, 3, 4, 5] },
    ])
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.15, 10)
    expect(deepseek?.cacheHitPricePerM).toBeCloseTo(0.003, 10)
    expect(deepseek?.outputPricePerM).toBeCloseTo(0.6, 10)
  })

  it('applies one field update and returns the resolved section', async () => {
    const { runtime, scope } = makeRuntime()
    const updated = await runtime.updateSettings({ field: 'cnyPerUsd', value: 7.3 })
    expect(updated.cnyPerUsd).toBe(7.3)
    expect(scope.get().cnyPerUsd).toBe(7.3)
    // Untouched fields survive the patch.
    expect(updated.currency).toBe('USD')
  })

  it('replaces exactly one provider profile', async () => {
    const { runtime } = makeRuntime()
    const before = await runtime.getSettings()
    const zai = before.providers.find(provider => provider.id === 'zai')
    const updated = await runtime.updateSettings({
      field: 'provider',
      value: { ...zai!, peakMultiplier: 4 },
    })
    expect(updated.providers.find(provider => provider.id === 'zai')?.peakMultiplier).toBe(4)
    expect(updated.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)?.peakMultiplier).toBe(2)
  })

  it('completes a window persisted without a day list', async () => {
    const initial = defaultOffpeakSettings()
    const legacy: OffpeakSettings = {
      ...initial,
      providers: initial.providers.map(provider => provider.id === DEEPSEEK_PROVIDER_ID
        ? { ...provider, peakWindows: [{ start: '08:30', end: '16:30' }] }
        : provider),
    }
    const { runtime } = makeRuntime(legacy)
    const read = await runtime.getSettings()
    // An omitted day list predates the weekday gate: it means every day.
    expect(read.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)?.peakWindows)
      .toEqual([{ start: '08:30', end: '16:30', days: [] }])
  })

  it('round-trips every settings field the client can write', async () => {
    const { runtime } = makeRuntime()
    await runtime.updateSettings({ field: 'currency', value: 'CNY' })
    await runtime.updateSettings({ field: 'cnyPerUsd', value: 7.3 })
    await runtime.updateSettings({ field: 'displayUtcOffsetMinutes', value: 0 })
    await runtime.updateSettings({ field: 'enabled', value: false })
    const settings = await runtime.getSettings()
    expect(settings.enabled).toBe(false)
    expect(settings.currency).toBe('CNY')
    expect(settings.cnyPerUsd).toBe(7.3)
    expect(settings.displayUtcOffsetMinutes).toBe(0)
    expect(settings.providers).toHaveLength(3)
  })
})
