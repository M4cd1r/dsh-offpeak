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
import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import { OffpeakRuntime } from '../src/runtime.ts'
import { OFFPEAK_NAMESPACE, OffpeakSettingsSchema } from '../src/settings.ts'
import {
  DEEPSEEK_PROVIDER_ID,
  defaultOffpeakSettings,
  defaultProviderProfiles,
  normalizeOffpeakSettings,
} from '../src/defaults.ts'
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
    const customized = defaultProviderProfiles()
      .map(provider => provider.id === DEEPSEEK_PROVIDER_ID
        ? { ...provider, inputPricePerM: 0.2 }
        : provider)
    // Only `inputPricePerM` was explicitly stored on the provider in the new
    // shape; precedence follows that per-field presence, so the other fields
    // still take the legacy values.
    const stored = {
      ...PERSISTED_V0_1_0,
      providers: [{ id: DEEPSEEK_PROVIDER_ID, inputPricePerM: 0.2 }],
    }
    const migrated = normalizeOffpeakSettings({ ...resolved, providers: customized }, stored)
    const deepseek = migrated.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    // The new shape set 0.2 explicitly; the legacy 0.28 must not clobber it.
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.2, 10)
    // Fields the new shape never stored still take the legacy value.
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

/* ------------------------------------------------------------------ */
/* The raw stored section drives precedence and the one-shot purge.    */
/* ------------------------------------------------------------------ */

/** The four legacy top-level keys, asserted directly on the stored section. */
const LEGACY_KEYS = ['inputPricePerM', 'cacheHitPricePerM', 'outputPricePerM', 'peakMultiplier'] as const

/** How a scripted provider refuses the runtime's purge write. */
type ReplaceFailure = 'sync-throw' | 'conflict-rejection'

/** A runtime over a scripted stored section, with purge observability. */
interface StoredHarness {
  runtime: OffpeakRuntime
  /** The raw section as currently persisted (detached). */
  storedSection(): Record<string, unknown>
  /** How many purge writes reached the provider. */
  replaceCalls(): number
  /** The `{expected, actual}` revision pair each purge write was sent with. */
  guardRevisions(): Array<{ expected: number; actual: number }>
}

/**
 * Wire a runtime to a scripted *stored* section, mirroring the real
 * `dsh-settings` surface the read path relies on:
 *
 * - `scope.get()` resolves the stored section through the real settings
 *   schema — legacy keys pass through resolution, exactly as production does;
 * - `ctx.settings.describe()` exposes the raw section (no schema defaults)
 *   plus its revision;
 * - `provider.replace()` validates like the real write path, refuses a stale
 *   revision with the real `SettingsConflictError`, persists detached, and
 *   counts every attempt.
 */
function makeStoredRuntime(raw: object, failure?: ReplaceFailure): StoredHarness {
  let stored = structuredClone(raw) as Record<string, unknown>
  let revision = 0
  let replaceCalls = 0
  const guards: Array<{ expected: number; actual: number }> = []
  const provider = {
    describe: () => [{
      ns: OFFPEAK_NAMESPACE,
      schema: OffpeakSettingsSchema,
      value: resolveSection(stored),
      revision,
      user: structuredClone(stored),
      applies: 'live' as const,
    }],
    replace: (_ns: unknown, section: object, expectedRevision?: number): Promise<void> => {
      replaceCalls += 1
      guards.push({ expected: expectedRevision ?? -1, actual: revision })
      if (failure === 'sync-throw') throw new Error('settings provider is read-only')
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        return Promise.reject(new SettingsConflictError(OFFPEAK_NAMESPACE, expectedRevision, revision))
      }
      if (failure === 'conflict-rejection') {
        return Promise.reject(new SettingsConflictError(OFFPEAK_NAMESPACE, expectedRevision ?? revision, revision + 1))
      }
      resolveSection(section) // the real write path validates before persisting
      stored = structuredClone(section) as Record<string, unknown>
      revision += 1
      return Promise.resolve()
    },
  }
  const ctx = new Context()
  ctx.provide('settings', provider as unknown as SettingsProvider)
  const scope: SettingsScope<OffpeakSettings> = {
    get: () => resolveSection(stored),
    watch: () => () => {},
    update: async (patch: object) => { stored = { ...stored, ...structuredClone(patch) } },
    replace: async (section: object) => { stored = structuredClone(section) as Record<string, unknown> },
  }
  return {
    runtime: new OffpeakRuntime(ctx, scope),
    storedSection: () => structuredClone(stored),
    replaceCalls: () => replaceCalls,
    guardRevisions: () => [...guards],
  }
}

describe('legacy precedence follows the raw stored section', () => {
  it('keeps an explicitly stored provider value even when it equals the shipped default', () => {
    // A user who set every price back to the shipped default stored the new
    // shape explicitly; the lingering legacy values must not override them.
    const stored = { ...PERSISTED_V0_1_0, providers: defaultProviderProfiles() }
    const migrated = normalizeOffpeakSettings(resolveSection(stored), stored)
    const deepseek = migrated.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.15, 10)
    expect(deepseek?.cacheHitPricePerM).toBeCloseTo(0.003, 10)
    expect(deepseek?.outputPricePerM).toBeCloseTo(0.6, 10)
    expect(deepseek?.peakMultiplier).toBe(2)
  })

  it('migrates legacy values when the stored section carries no provider values', () => {
    const migrated = normalizeOffpeakSettings(resolveSection(PERSISTED_V0_1_0), PERSISTED_V0_1_0)
    const deepseek = migrated.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.28, 10)
    expect(deepseek?.peakMultiplier).toBe(3)
  })
})

describe('the runtime read path migrates from the stored section', () => {
  it('keeps an explicitly stored provider value even at the shipped default', async () => {
    const harness = makeStoredRuntime({ ...PERSISTED_V0_1_0, providers: defaultProviderProfiles() })
    const read = await harness.runtime.getSettings()
    const deepseek = read.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.15, 10)
    expect(deepseek?.peakMultiplier).toBe(2)
  })

  it('migrates a v0.1.0 section that stored no providers', async () => {
    const harness = makeStoredRuntime(PERSISTED_V0_1_0)
    const read = await harness.runtime.getSettings()
    const deepseek = read.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.28, 10)
    expect(deepseek?.peakMultiplier).toBe(3)
  })

  it('purges the legacy keys once, preserves the migrated values, and stays stable', async () => {
    const harness = makeStoredRuntime(PERSISTED_V0_1_0)
    const first = await harness.runtime.getSettings()
    // Single-shot: exactly one purge write, guarded by the revision that was read.
    expect(harness.replaceCalls()).toBe(1)
    expect(harness.guardRevisions()).toEqual([{ expected: 0, actual: 0 }])
    const cleaned = harness.storedSection()
    for (const key of LEGACY_KEYS) expect(key in cleaned).toBe(false)
    // The migrated values survive in the new shape; nothing else is lost.
    const providers = cleaned.providers as Array<Record<string, unknown>>
    const deepseek = providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.28, 10)
    expect(deepseek?.peakMultiplier).toBe(3)
    expect(cleaned.cnyPerUsd).toBe(6.9)
    // A later read is stable: same value, no second write, no oscillation.
    const second = await harness.runtime.getSettings()
    expect(second).toEqual(first)
    expect(harness.replaceCalls()).toBe(1)
  })

  it('leaves a current-shaped stored section untouched', async () => {
    const harness = makeStoredRuntime(defaultOffpeakSettings())
    const first = await harness.runtime.getSettings()
    expect(harness.replaceCalls()).toBe(0)
    expect(harness.storedSection()).toEqual(defaultOffpeakSettings())
    expect(await harness.runtime.getSettings()).toEqual(first)
  })

  it('never lets a synchronously failing purge write break the read', async () => {
    const harness = makeStoredRuntime(PERSISTED_V0_1_0, 'sync-throw')
    const read = await harness.runtime.getSettings()
    const deepseek = read.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.28, 10)
    expect(harness.replaceCalls()).toBe(1)
    expect('inputPricePerM' in harness.storedSection()).toBe(true)
    // The failed attempt settles the in-flight guard; a later read still works.
    await harness.runtime.getSettings()
    expect(harness.replaceCalls()).toBe(2)
  })

  it('never lets a conflicting purge write break the read', async () => {
    const harness = makeStoredRuntime(PERSISTED_V0_1_0, 'conflict-rejection')
    const read = await harness.runtime.getSettings()
    const deepseek = read.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)
    expect(deepseek?.inputPricePerM).toBeCloseTo(0.28, 10)
    expect(harness.replaceCalls()).toBe(1)
    // A refused write clobbers nothing: the legacy keys remain stored.
    expect('inputPricePerM' in harness.storedSection()).toBe(true)
    const second = await harness.runtime.getSettings()
    expect(second.providers.find(provider => provider.id === DEEPSEEK_PROVIDER_ID)?.inputPricePerM)
      .toBeCloseTo(0.28, 10)
    expect(harness.replaceCalls()).toBe(2)
  })
})
