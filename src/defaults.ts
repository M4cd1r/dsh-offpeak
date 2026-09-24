/**
 * Defaults and normalization for dsh-offpeak.
 *
 * Pricing is **per provider**: each profile carries its own UTC peak windows,
 * peak multiplier, price table and holiday calendar, because gateways
 * disagree — DeepSeek bills two weekday windows at ×2 excluding Chinese public
 * holidays, Z.ai's coding plans use a different single window, and OpenCode Go
 * has no peak pricing at all.
 *
 * Every figure below was read from the provider's own pricing page and is
 * user-overridable in Settings. Both shipped providers gate peak pricing to
 * Monday–Friday; weekends are off-peak for each of them.
 *
 *   DeepSeek  https://api-docs.deepseek.com/quick_start/pricing
 *             "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday
 *              through Friday (all other hours are off-peak)", excluding
 *              Chinese public holidays.
 *   Z.ai      https://docs.z.ai/devpack/overview
 *             "Peak hours: Monday to Friday, 14:00–18:00 Singapore Standard
 *              Time (UTC+8)." GLM-5.2 burns plan quota at 3× inside that window.
 */
import {
  HOLIDAY_DATE_PATTERN,
  type OffpeakDay,
  type OffpeakProviderProfile,
  type OffpeakSettings,
  type OffpeakSettingsUpdate,
  type PeakWindowSpec,
} from './contract.ts'

/** The working week both shipped providers bill as peak. */
export const WEEKDAYS: readonly OffpeakDay[] = [1, 2, 3, 4, 5]

/**
 * Official DeepSeek base prices for `deepseek-flash`
 * (USD per 1M tokens, off-peak). Peak = 2 × these.
 */
export const DEFAULT_PRICES = {
  inputPerM: 0.15,
  cacheHitPerM: 0.003,
  outputPerM: 0.6,
} as const

/** Official DeepSeek peak multiplier (peak = 2 × off-peak). */
export const DEFAULT_PEAK_MULTIPLIER = 2

/**
 * Official DeepSeek peak windows: 01:00–04:00 and 06:00–10:00 UTC on weekdays,
 * which is 09:00–12:00 and 14:00–18:00 Beijing time (UTC+8).
 */
export const DEEPSEEK_PEAK_WINDOWS: readonly PeakWindowSpec[] = [
  { start: '01:00', end: '04:00', days: WEEKDAYS },
  { start: '06:00', end: '10:00', days: WEEKDAYS },
]

/** Official Z.ai GLM Coding Plan peak window: 14:00–18:00 UTC+8 = 06:00–10:00 UTC, weekdays. */
export const ZAI_PEAK_WINDOWS: readonly PeakWindowSpec[] = [
  { start: '06:00', end: '10:00', days: WEEKDAYS },
]

/**
 * Official DeepSeek holiday exclusion: the 2026 Chinese public holidays as UTC
 * calendar dates (`YYYY-MM-DD`), on which no peak window is billed. The pricing
 * rule peaks "Monday through Friday, excluding Chinese public holidays"
 * (https://api-docs.deepseek.com/quick_start/pricing); the concrete dates were
 * cross-checked against https://www.timeanddate.com/holidays/china/2026.
 *
 * **This is a yearly snapshot requiring annual maintenance**: refresh it once a
 * year when the next calendar is published, or the engine will keep billing
 * last year's holidays. Weekend dates may stay listed even though the weekday
 * gate already makes them off-peak. The list is user-editable per provider in
 * Settings.
 */
export const DEEPSEEK_HOLIDAY_DATES_2026: readonly string[] = [
  // New Year's Day
  '2026-01-01', '2026-01-02', '2026-01-03',
  // Spring Festival
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  // Qingming Festival
  '2026-04-04', '2026-04-05', '2026-04-06',
  // Labour Day
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  // Dragon Boat Festival
  '2026-06-19', '2026-06-20', '2026-06-21',
  // Mid-Autumn Festival
  '2026-09-25', '2026-09-26', '2026-09-27',
  // National Day
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
]

/** Display offset for Asia/Shanghai (UTC+8), the DeepSeek home market. */
export const DEFAULT_DISPLAY_UTC_OFFSET_MINUTES = 8 * 60

/** Common USD → CNY reference used only when the user picks CNY display. */
export const DEFAULT_CNY_PER_USD = 7.1

/** Provider id of the in-box DeepSeek route. */
export const DEEPSEEK_PROVIDER_ID = 'deepseek-official'

/**
 * Shipped provider profiles.
 *
 * DeepSeek and Z.ai both publish a peak window, and they differ — which is the
 * whole reason the window lives on the provider:
 *
 *   DeepSeek  01:00–04:00 and 06:00–10:00 UTC on weekdays, peak = 2 × off-peak,
 *             excluding the Chinese public holidays listed above.
 *   Z.ai GLM  14:00–18:00 UTC+8 = 06:00–10:00 UTC on weekdays, peak burns
 *             coding-plan quota at 3 × the standard rate.
 *
 * `opencode-go` ships disabled with no window because OpenCode Go bills a flat
 * subscription rate: that is the case the per-provider model exists to express,
 * and the pill then reports a flat window with multiplier 1 instead of
 * inventing a countdown. OpenCode Zen is a different pay-as-you-go service with
 * no published peak schedule, so it is deliberately not represented.
 *
 * Prices are USD per 1M tokens and apply to per-token gateways only; a
 * subscription plan (Z.ai, OpenCode) leaves them at 0 and the pill hides the
 * price block rather than showing zeros.
 */
export function defaultProviderProfiles(): OffpeakProviderProfile[] {
  return [
    {
      id: DEEPSEEK_PROVIDER_ID,
      label: 'DeepSeek',
      enabled: true,
      peakMultiplier: DEFAULT_PEAK_MULTIPLIER,
      peakWindows: DEEPSEEK_PEAK_WINDOWS.map(window => ({ ...window })),
      holidays: [...DEEPSEEK_HOLIDAY_DATES_2026],
      inputPricePerM: DEFAULT_PRICES.inputPerM,
      cacheHitPricePerM: DEFAULT_PRICES.cacheHitPerM,
      outputPricePerM: DEFAULT_PRICES.outputPerM,
    },
    {
      id: 'zai',
      label: 'Z.ai (GLM coding plan)',
      enabled: true,
      peakMultiplier: 3,
      peakWindows: ZAI_PEAK_WINDOWS.map(window => ({ ...window })),
      holidays: [],
      inputPricePerM: 0,
      cacheHitPricePerM: 0,
      outputPricePerM: 0,
    },
    {
      id: 'opencode-go',
      label: 'OpenCode Go',
      enabled: false,
      peakMultiplier: 1,
      peakWindows: [],
      holidays: [],
      inputPricePerM: 0,
      cacheHitPricePerM: 0,
      outputPricePerM: 0,
    },
  ]
}

/** Fresh settings defaults for host and browser initialization. */
export function defaultOffpeakSettings(): OffpeakSettings {
  return {
    enabled: true,
    currency: 'USD',
    cnyPerUsd: DEFAULT_CNY_PER_USD,
    displayUtcOffsetMinutes: DEFAULT_DISPLAY_UTC_OFFSET_MINUTES,
    activeProviderId: DEEPSEEK_PROVIDER_ID,
    providers: defaultProviderProfiles(),
  }
}

/**
 * The v0.1.0 top-level pricing fields a legacy persisted section carried,
 * before the per-provider rework moved them into `providers[]`. All optional:
 * a current-shaped section carries none of them. Schemastery passes unknown
 * keys through resolution, so these survive the settings schema read and the
 * normalization below migrates them.
 */
export interface LegacyOffpeakPricing {
  readonly inputPricePerM?: number
  readonly cacheHitPricePerM?: number
  readonly outputPricePerM?: number
  readonly peakMultiplier?: number
}

/** A settings section as the host may read it: the new shape plus optional legacy pricing fields. */
export type OffpeakSettingsSection = OffpeakSettings & LegacyOffpeakPricing

/**
 * A raw *stored* section — the user layer exactly as
 * `ctx.settings.describe()` reports it, WITHOUT schema defaults. Only the
 * keys the stored document actually carries are present, both at the top
 * level and inside each provider entry, so key **presence** (not value) is
 * what marks a provider field as explicitly stored — the fact the legacy
 * precedence below decides on.
 */
export type StoredOffpeakSection = Partial<Omit<OffpeakSettingsSection, 'providers'>> & {
  readonly providers?: readonly Partial<OffpeakProviderProfile>[]
}

/** The four legacy field names, for presence checks and removal. */
const LEGACY_PRICING_KEYS = ['inputPricePerM', 'cacheHitPricePerM', 'outputPricePerM', 'peakMultiplier'] as const

/**
 * Whether a section still carries any of the four legacy top-level pricing
 * keys. This is the trigger for the read path's one-shot storage purge: once
 * a read sees `false`, the legacy keys are gone from storage and cannot
 * resurface on any later read.
 *
 * @param section - a resolved section, a raw stored section, or `undefined`.
 * @returns whether at least one legacy key is present with a value.
 */
export function hasLegacyPricing(section: OffpeakSettingsSection | StoredOffpeakSection | undefined): boolean {
  if (section === undefined) return false
  return LEGACY_PRICING_KEYS.some(key => section[key] !== undefined)
}

/**
 * Resolve one legacy-priced field under stored-section precedence:
 *
 * - no legacy value → the provider value stands;
 * - the stored section explicitly carries the provider field → that value
 *   **always wins, even when it equals the shipped default** (comparing
 *   values against the default, as the first cut did, silently reversed the
 *   precedence exactly there);
 * - otherwise the stored section carries no value for the field, so the
 *   legacy value applies.
 *
 * When no stored section is available (a caller passing only the resolved
 * view), nothing can be known to be explicit and the legacy value applies,
 * which keeps a pure v0.1.0 migration working. The runtime always supplies
 * the stored section through `ctx.settings.describe()`, so production
 * precedence is the exact presence test.
 */
function legacyOrProvider(legacy: number | undefined, providerValue: number, explicitlyStored: boolean): number {
  if (legacy === undefined) return providerValue
  return explicitlyStored ? providerValue : legacy
}

/**
 * Migrate a persisted settings section to the per-provider shape. v0.1.0
 * persisted pricing as four top-level fields; those values are applied to the
 * `deepseek-official` profile, where a provider value explicitly present in
 * the stored section always takes precedence (see {@link legacyOrProvider}).
 * The input is never mutated and the result carries no legacy keys — the
 * migrated values the read path's purge persists in their place.
 *
 * @param section - the schema-resolved section; legacy keys pass through
 *   resolution, so they are visible here.
 * @param stored - the raw stored section, when the caller can read it
 *   (`ctx.settings.describe()` on the runtime path); its key presence decides
 *   which side of the precedence wins.
 */
export function migrateLegacyOffpeakSettings(section: OffpeakSettingsSection, stored?: StoredOffpeakSection): OffpeakSettings {
  const carriesLegacy = hasLegacyPricing(section)
  const providers = carriesLegacy
    ? section.providers.map((provider) => {
      if (provider.id !== DEEPSEEK_PROVIDER_ID) return provider
      const storedProvider = stored?.providers?.find(profile => profile.id === DEEPSEEK_PROVIDER_ID)
      const explicit = (key: (typeof LEGACY_PRICING_KEYS)[number]): boolean =>
        storedProvider !== undefined && storedProvider[key] !== undefined
      return {
        ...provider,
        inputPricePerM: legacyOrProvider(section.inputPricePerM, provider.inputPricePerM, explicit('inputPricePerM')),
        cacheHitPricePerM: legacyOrProvider(section.cacheHitPricePerM, provider.cacheHitPricePerM, explicit('cacheHitPricePerM')),
        outputPricePerM: legacyOrProvider(section.outputPricePerM, provider.outputPricePerM, explicit('outputPricePerM')),
        peakMultiplier: legacyOrProvider(section.peakMultiplier, provider.peakMultiplier, explicit('peakMultiplier')),
      }
    })
    : section.providers
  return {
    enabled: section.enabled,
    currency: section.currency,
    cnyPerUsd: section.cnyPerUsd,
    displayUtcOffsetMinutes: section.displayUtcOffsetMinutes,
    activeProviderId: section.activeProviderId,
    providers,
  }
}

/**
 * Complete a window read from durable settings, where an omitted `days` list
 * predates the weekday gate and therefore meant "every day".
 */
function normalizeWindow(window: PeakWindowSpec): PeakWindowSpec {
  return { start: window.start, end: window.end, days: window.days ?? [] }
}

/** Complete one provider profile read from durable settings. */
export function normalizeProviderProfile(profile: OffpeakProviderProfile): OffpeakProviderProfile {
  return {
    ...profile,
    peakWindows: profile.peakWindows.map(normalizeWindow),
    // Repair, do not reject: the storage schema accepts any string (rejecting
    // it there would fail settings registration and brick the plugin), but the
    // wire contract requires `YYYY-MM-DD`, so a malformed entry dropped here
    // can never fail `getSettings` result validation. The engine is also
    // immune to malformed entries — its holiday keys are well-formed UTC date
    // strings — so dropping one only removes noise, never behaviour.
    holidays: (profile.holidays ?? []).filter(date => HOLIDAY_DATE_PATTERN.test(date)),
  }
}

/**
 * Complete a whole settings section read from durable settings: migrate any
 * legacy top-level pricing onto the DeepSeek provider using the raw stored
 * section's key presence, then complete every profile so one persisted before
 * the weekday gate or the holiday calendar existed still resolves each field
 * it displays — dropping holiday entries that are not `YYYY-MM-DD` so a
 * malformed stored date can never fail the wire contract.
 *
 * @param section - the schema-resolved section.
 * @param stored - the raw stored section, when the caller can read it; see
 *   {@link migrateLegacyOffpeakSettings} for how it steers precedence.
 */
export function normalizeOffpeakSettings(section: OffpeakSettingsSection, stored?: StoredOffpeakSection): OffpeakSettings {
  const migrated = migrateLegacyOffpeakSettings(section, stored)
  return { ...migrated, providers: migrated.providers.map(normalizeProviderProfile) }
}

/**
 * The profile the pill reads: the active one when it still exists, else the
 * first configured provider, else the shipped DeepSeek default.
 */
export function resolveActiveProfile(settings: OffpeakSettings): OffpeakProviderProfile {
  const active = settings.providers.find(provider => provider.id === settings.activeProviderId)
  if (active !== undefined) return normalizeProviderProfile(active)
  const first = settings.providers[0]
  if (first !== undefined) return normalizeProviderProfile(first)
  return defaultProviderProfiles()[0] as OffpeakProviderProfile
}

/** Apply one field update to a settings object, returning a fresh object. */
export function applySettingsUpdate(
  current: OffpeakSettings,
  update: OffpeakSettingsUpdate,
): OffpeakSettings {
  switch (update.field) {
    case 'enabled':
    case 'currency':
    case 'cnyPerUsd':
    case 'displayUtcOffsetMinutes':
    case 'activeProviderId':
      return { ...current, [update.field]: update.value }
    case 'provider': {
      const replacement = normalizeProviderProfile(update.value)
      const known = current.providers.some(provider => provider.id === replacement.id)
      const providers = known
        ? current.providers.map(provider => (provider.id === replacement.id ? replacement : provider))
        : [...current.providers, replacement]
      return { ...current, providers }
    }
    case 'providers':
      return { ...current, providers: update.value.map(normalizeProviderProfile) }
  }
}
