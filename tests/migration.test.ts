/**
 * Legacy v0.1.0 settings migration tests. The first release persisted pricing
 * as four top-level fields (`inputPricePerM`, `cacheHitPricePerM`,
 * `outputPricePerM`, `peakMultiplier`); the per-provider rework moved them into
 * `providers[]`. A persisted old section must survive the real settings schema
 * resolution and land its customized values on the DeepSeek provider, with
 * new-shape provider values taking precedence when both shapes exist.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { OffpeakRuntime } from '../src/runtime.ts'
import { OffpeakSettingsSchema } from '../src/settings.ts'
import { DEEPSEEK_PROVIDER_ID, defaultOffpeakSettings, normalizeOffpeakSettings } from '../src/defaults.ts'
import type { OffpeakSettings } from '../src/contract.ts'

/** The schema's callable resolution face (schemastery resolves and completes). */
const resolveSection = (raw: unknown): OffpeakSettings =>
  (OffpeakSettingsSchema as unknown as (value: unknown) => OffpeakSettings)(raw)

/**
 * The section v0.1.0 actually persisted, exactly as the old schema wrote it:
 * flat pricing fields, no `providers`, no `activeProviderId`. The values are
 * customized (not the shipped defaults) so preservation is observable.
 */
const PERSISTED_V0_1_0 = {
  enabled: true,
  currency: 'USD',
  cnyPerUsd: 6.9,
  inputPricePerM: 0.28,
  cacheHitPricePerM: 0.028,
  outputPricePerM: 0.42,
  peakMultiplier: 3,
  displayUtcOffsetMinutes: 0,
} as const

/** Scripted settings scope (get only — all the read path uses). */
function fakeSettingsScope(section: OffpeakSettings): SettingsScope<OffpeakSettings> {
  return {
    get: () => section,
    update: async (patch: object) => { section = { ...section, ...patch } },
    watch: () => () => {},
    replace: async (value: object) => { section = { ...defaultOffpeakSettings(), ...value } },
  }
}

/** Deep-freeze a value so any mutation attempt throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

describe('legacy v0.1.0 settings migration', () => {
  it('resolves the real persisted old section through the schema and migrates it', () => {
    const resolved = resolveSection(PERSISTED_V0_1_0)
    const migrated = normalizeOffpeakSettings(resolved)
    const deepseek = migrated.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.28, 10)
    expect(deepseek?.cacheHitPricePerM).toBeCloseTo(0.028, 10)
    expect(deepseek?.outputPricePerM).toBeCloseTo(0.42, 10)
    expect(deepseek?.peakMultiplier).toBe(3)
  })

  it('strips the legacy top-level keys from the migrated result', () => {
    const migrated = normalizeOffpeakSettings(resolveSection(PERSISTED_V0_1_0))
    expect('inputPricePerM' in migrated).toBe(false)
    expect('cacheHitPricePerM' in migrated).toBe(false)
    expect('outputPricePerM' in migrated).toBe(false)
    expect('peakMultiplier' in migrated).toBe(false)
  })

  it('keeps the rest of the old section intact', () => {
    const migrated = normalizeOffpeakSettings(resolveSection(PERSISTED_V0_1_0))
    expect(migrated.enabled).toBe(true)
    expect(migrated.currency).toBe('USD')
    expect(migrated.cnyPerUsd).toBe(6.9)
    expect(migrated.displayUtcOffsetMinutes).toBe(0)
    expect(migrated.activeProviderId).toBe(DEEPSEEK_PROVIDER_ID)
    expect(migrated.providers).toHaveLength(3)
  })

  it('leaves the shipped DeepSeek windows untouched by the migration', () => {
    const migrated = normalizeOffpeakSettings(resolveSection(PERSISTED_V0_1_0))
    const deepseek = migrated.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.peakWindows).toEqual(defaultOffpeakSettings().providers
      .find(provider => provider.id === DEEPSEEK_PROVIDER_ID)?.peakWindows)
  })

  it('migrates on the runtime read path', async () => {
    const resolved = resolveSection(PERSISTED_V0_1_0)
    const runtime = new OffpeakRuntime(new Context(), fakeSettingsScope(resolved))
    const settings = await runtime.getSettings()
    const deepseek = settings.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.28, 10)
    expect(deepseek?.peakMultiplier).toBe(3)
    expect('inputPricePerM' in settings).toBe(false)
  })

  it('lets new-shape provider values win over legacy top-level values', () => {
    const resolved = resolveSection(PERSISTED_V0_1_0)
    const customized = defaultOffpeakSettings().providers
      .map(provider => provider.id === DEEPSEEK_PROVIDER_ID
        ? { ...provider, inputPricePerM: 0.2 }
        : provider)
    const migrated = normalizeOffpeakSettings({ ...resolved, providers: customized })
    const deepseek = migrated.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    // The new shape set 0.2 explicitly; the legacy 0.28 must not clobber it.
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.2, 10)
    // Fields the new shape left at the shipped default still take the legacy value.
    expect(deepseek?.cacheHitPricePerM).toBeCloseTo(0.028, 10)
    expect(deepseek?.peakMultiplier).toBe(3)
  })

  it('leaves a current-shaped section unchanged', () => {
    const current = defaultOffpeakSettings()
    expect(normalizeOffpeakSettings(current)).toEqual(current)
  })

  it('does not mutate the section it migrates', () => {
    const frozen = deepFreeze(resolveSection(PERSISTED_V0_1_0))
    const before = JSON.stringify(frozen)
    expect(() => normalizeOffpeakSettings(frozen)).not.toThrow()
    expect(JSON.stringify(frozen)).toBe(before)
  })
})
