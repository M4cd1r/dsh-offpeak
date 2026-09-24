/**
 * The `offpeak` settings namespace: every pricing and display preference is a
 * durable, user-editable section managed from the Web settings page. The
 * runtime reads the owner scope's live value on every call, so changes take
 * effect without a restart (`applies: 'live'`).
 *
 * The provider list is a first-class part of the section: off-peak windows are
 * a per-provider fact, so adding a gateway or changing its hours is a settings
 * edit, not a code change.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SettingsNamespace, SettingsScope } from '@deepseek-ai/dsh-settings'
import type { OffpeakDay, OffpeakProviderProfile, OffpeakSettings, PeakWindowSpec } from './contract.ts'
import {
  DEEPSEEK_PROVIDER_ID,
  DEFAULT_CNY_PER_USD,
  DEFAULT_DISPLAY_UTC_OFFSET_MINUTES,
  defaultProviderProfiles,
} from './defaults.ts'

/**
 * The namespace name (plain lowercase-hyphenated identifier; the settings
 * provider brands it on registration, and the Web allowlist lists the same
 * string). The brand is a phantom type: `settingsNamespace()` was removed from
 * the seam, so the cast is how a namespace is named.
 */
export const OFFPEAK_NAMESPACE = 'offpeak' as SettingsNamespace

/**
 * One day of the week. Schemastery's numeric schema yields `number`, so the
 * element is pinned to the contract's ISO union: the section's type must stay
 * identical to `PeakWindowSpec` for the runtime's reads to type-check.
 */
const daySchema = z.number().min(1).max(7) as unknown as z<OffpeakDay>

/** Schemastery schema of one peak window. */
const peakWindowSchema = z.object({
  start: z.string().default('00:00'),
  end: z.string().default('00:00'),
  /**
   * ISO weekdays (1 = Monday … 7 = Sunday) the window applies to; empty runs
   * every day. Stored settings written before the weekday gate existed have no
   * `days` key, and the default keeps those windows running every day.
   */
  days: z.array(daySchema).default([]),
}) as unknown as z<PeakWindowSpec>

/** Schemastery schema of one provider profile. */
const providerProfileSchema = z.object({
  id: z.string().required(),
  label: z.string().default(''),
  enabled: z.boolean().default(false),
  peakMultiplier: z.number().min(1).max(100).default(2),
  peakWindows: z.array(peakWindowSchema).default([]),
  /**
   * Holiday dates (`YYYY-MM-DD`, UTC) on which the provider bills no peak
   * window. Profiles persisted before the holiday calendar existed carry no
   * `holidays` key; the default keeps those providers peaking on holidays,
   * which is what they published.
   */
  holidays: z.array(z.string()).default([]),
  inputPricePerM: z.number().min(0).default(0),
  cacheHitPricePerM: z.number().min(0).default(0),
  outputPricePerM: z.number().min(0).default(0),
}) as unknown as z<OffpeakProviderProfile>

/**
 * Schemastery schema of the `offpeak` namespace section.
 *
 * A section persisted by v0.1.0 carries four top-level pricing fields
 * (`inputPricePerM`, `cacheHitPricePerM`, `outputPricePerM`, `peakMultiplier`)
 * this schema no longer declares. Schemastery passes unknown keys through
 * resolution, so they survive the read; `normalizeOffpeakSettings` then
 * migrates them onto the DeepSeek provider profile.
 */
export const OffpeakSettingsSchema: z<OffpeakSettings> = z.object({
  enabled: z.boolean().default(true),
  currency: z.union(['USD', 'CNY'] as const).default('USD'),
  cnyPerUsd: z.number().min(0).default(DEFAULT_CNY_PER_USD),
  displayUtcOffsetMinutes: z.number().min(-840).max(840).default(DEFAULT_DISPLAY_UTC_OFFSET_MINUTES),
  activeProviderId: z.string().default(DEEPSEEK_PROVIDER_ID),
  providers: z.array(providerProfileSchema).default(defaultProviderProfiles()),
})

/**
 * Register the namespace with the settings provider and return its owner scope.
 * @param ctx - the plugin context carrying the settings provider.
 * @returns the owner scope backing the runtime's live reads.
 */
export function registerOffpeakSettings(ctx: Context): SettingsScope<OffpeakSettings> {
  return ctx.settings.register(OFFPEAK_NAMESPACE, OffpeakSettingsSchema, { applies: 'live' })
}
