/**
 * Defaults and normalization for dsh-offpeak.
 *
 * Pricing is **per provider**: each profile carries its own UTC peak windows,
 * peak multiplier and price table, because gateways disagree — DeepSeek bills
 * two weekday windows at ×2, Z.ai's coding plans use a different single window,
 * and OpenCode Go/Zen has no peak pricing at all.
 *
 * Every figure below was read from the provider's own pricing page and is
 * user-overridable in Settings. Both shipped providers gate peak pricing to
 * Monday–Friday; weekends are off-peak for each of them.
 *
 *   DeepSeek  https://api-docs.deepseek.com/quick_start/pricing
 *             "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday
 *              through Friday (all other hours are off-peak)."
 *   Z.ai      https://docs.z.ai/devpack/overview
 *             "Peak hours: Monday to Friday, 14:00–18:00 Singapore Standard
 *              Time (UTC+8)." GLM-5.2 burns plan quota at 3× inside that window.
 */
import type {
  OffpeakDay,
  OffpeakProviderProfile,
  OffpeakSettings,
  OffpeakSettingsUpdate,
  PeakWindowSpec,
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
 *   DeepSeek  01:00–04:00 and 06:00–10:00 UTC on weekdays, peak = 2 × off-peak.
 *   Z.ai GLM  14:00–18:00 UTC+8 = 06:00–10:00 UTC on weekdays, peak burns
 *             coding-plan quota at 3 × the standard rate.
 *
 * `opencode-go` ships disabled with no window because it bills a flat rate:
 * that is the case the per-provider model exists to express, and the pill then
 * reports a flat window with multiplier 1 instead of inventing a countdown.
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
      inputPricePerM: 0,
      cacheHitPricePerM: 0,
      outputPricePerM: 0,
    },
    {
      id: 'opencode-go',
      label: 'OpenCode Go / Zen',
      enabled: false,
      peakMultiplier: 1,
      peakWindows: [],
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
 * Complete a window read from durable settings, where an omitted `days` list
 * predates the weekday gate and therefore meant "every day".
 */
function normalizeWindow(window: PeakWindowSpec): PeakWindowSpec {
  return { start: window.start, end: window.end, days: window.days ?? [] }
}

/** Complete one provider profile read from durable settings. */
export function normalizeProviderProfile(profile: OffpeakProviderProfile): OffpeakProviderProfile {
  return { ...profile, peakWindows: profile.peakWindows.map(normalizeWindow) }
}

/**
 * Complete a whole settings section read from durable settings, so a profile
 * persisted before the weekday gate still resolves every field it displays.
 */
export function normalizeOffpeakSettings(settings: OffpeakSettings): OffpeakSettings {
  return { ...settings, providers: settings.providers.map(normalizeProviderProfile) }
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
