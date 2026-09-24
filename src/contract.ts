/**
 * The dsh-offpeak wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register` in typert.ts), the host runtime (`OffpeakRuntime`),
 * and the client contribution (`ctx.remote.$mount` in client/remote.ts).
 * Every value crossing the wire is JSON-compatible and strictly codec-validated.
 *
 * Per-provider model: off-peak pricing is a property of the *provider*, not of
 * the plugin. DeepSeek bills two weekday windows at ×2, other gateways define
 * completely different windows (or none at all — a flat rate), so every
 * provider carries its own window list, multiplier and price table, and the
 * status pill renders the active provider's profile.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** Display currency for price figures. */
export type Currency = 'USD' | 'CNY'

/** Pricing window kind. */
export type OffpeakWindowKind = 'peak' | 'offpeak'

/** A day of the week as an ISO number: 1 = Monday … 7 = Sunday. */
export type OffpeakDay = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * One daily peak window, `HH:MM` in UTC. `start > end` describes a window that
 * wraps past midnight (e.g. `22:00` → `02:00`); `start === end` is inert.
 *
 * `days` gates the window to a set of weekdays evaluated in UTC, as a window
 * that wraps past midnight belongs to its start day. Both shipped providers
 * bill peak hours Monday–Friday only. An empty list means every day.
 */
export interface PeakWindowSpec {
  readonly start: string
  readonly end: string
  readonly days?: readonly OffpeakDay[]
}

/** Per-window price table (USD per 1M tokens, before the peak multiplier). */
export interface WindowPrices {
  readonly inputPerM: number
  readonly cacheHitPerM: number
  readonly outputPerM: number
}

/** One provider's off-peak profile. */
export interface OffpeakProviderProfile {
  /** Provider id as DSH reports it (e.g. `deepseek-official`, `zai`, `opencode-go`). */
  readonly id: string
  /** Human label shown in the pill and the settings list. */
  readonly label: string
  /**
   * Whether this provider bills peak/off-peak at all. `false` is the honest
   * state for a flat-rate gateway: the pill then reports a single flat window
   * with multiplier 1 and never claims a countdown.
   */
  readonly enabled: boolean
  /** Price factor applied inside a peak window. */
  readonly peakMultiplier: number
  /** Daily peak windows in UTC; empty means "always off-peak" (flat rate). */
  peakWindows: PeakWindowSpec[]
  /**
   * UTC calendar dates (`YYYY-MM-DD`) on which no peak window is billed at all,
   * whatever the window list says — DeepSeek excludes Chinese public holidays.
   * Empty for providers without a published holiday rule.
   */
  readonly holidays: readonly string[]
  /** Input (cache-miss) price in USD per 1M tokens outside peak windows. */
  readonly inputPricePerM: number
  /** Cache-hit price in USD per 1M tokens outside peak windows. */
  readonly cacheHitPricePerM: number
  /** Output price in USD per 1M tokens outside peak windows. */
  readonly outputPricePerM: number
}

/** Durable plugin settings (the `offpeak` settings namespace). */
export interface OffpeakSettings {
  /** Whether the status pill is rendered under the composer. */
  readonly enabled: boolean
  /** Display currency for all price figures. */
  readonly currency: Currency
  /** USD → CNY conversion factor, used when `currency` is `CNY`. */
  readonly cnyPerUsd: number
  /** UTC offset in minutes used only for local display of switch times. */
  readonly displayUtcOffsetMinutes: number
  /** Provider id whose profile the pill reads. */
  readonly activeProviderId: string
  /** Every configured provider, in display order. */
  providers: OffpeakProviderProfile[]
}

/** One field update sent through the plugin-owned settings Remote. */
export type OffpeakSettingsUpdate =
  | { readonly field: 'enabled'; readonly value: boolean }
  | { readonly field: 'currency'; readonly value: Currency }
  | { readonly field: 'cnyPerUsd'; readonly value: number }
  | { readonly field: 'displayUtcOffsetMinutes'; readonly value: number }
  | { readonly field: 'activeProviderId'; readonly value: string }
  /** Replace exactly one provider profile, matched by `value.id`. */
  | { readonly field: 'provider'; readonly value: OffpeakProviderProfile }
  /** Replace the whole provider list (used when the user removes one). */
  | { readonly field: 'providers'; readonly value: OffpeakProviderProfile[] }

/* ------------------------------------------------------------------ */
/* Wire codecs (zod). Host and client share these exact schemas.       */
/* ------------------------------------------------------------------ */

export const currencySchema = z.enum(['USD', 'CNY'])

export const offpeakWindowKindSchema = z.enum(['peak', 'offpeak'])

export const peakWindowSpecSchema = z.object({
  start: z.string(),
  end: z.string(),
  days: z.array(z.number().int().min(1).max(7)).readonly().optional(),
}).readonly()

export const offpeakProviderProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  enabled: z.boolean(),
  peakMultiplier: z.number().min(1).max(100),
  peakWindows: z.array(peakWindowSpecSchema).readonly(),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)).readonly(),
  inputPricePerM: z.number().min(0),
  cacheHitPricePerM: z.number().min(0),
  outputPricePerM: z.number().min(0),
}).readonly()

export const offpeakSettingsSchema = z.object({
  enabled: z.boolean(),
  currency: currencySchema,
  cnyPerUsd: z.number().min(0),
  displayUtcOffsetMinutes: z.number().min(-840).max(840),
  activeProviderId: z.string(),
  providers: z.array(offpeakProviderProfileSchema).readonly(),
}).readonly()

export const offpeakSettingsUpdateSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('enabled'), value: z.boolean() }).readonly(),
  z.object({ field: z.literal('currency'), value: currencySchema }).readonly(),
  z.object({ field: z.literal('cnyPerUsd'), value: z.number().min(0) }).readonly(),
  z.object({ field: z.literal('displayUtcOffsetMinutes'), value: z.number().min(-840).max(840) }).readonly(),
  z.object({ field: z.literal('activeProviderId'), value: z.string() }).readonly(),
  z.object({ field: z.literal('provider'), value: offpeakProviderProfileSchema }).readonly(),
  z.object({ field: z.literal('providers'), value: z.array(offpeakProviderProfileSchema).readonly() }).readonly(),
])

/* ------------------------------------------------------------------ */
/* Typert invocation descriptors (strict wire contract).               */
/* ------------------------------------------------------------------ */

/** The dsh-offpeak Remote namespace's strict invocation descriptors. */
export const OFFPEAK_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: 'dsh-offpeak#offpeak/getSettings',
    service: 'offpeak',
    namespace: 'offpeak',
    method: 'getSettings',
    invocation: { kind: 'direct' },
    parameters: [],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-offpeak#OffpeakSettings',
      schema: offpeakSettingsSchema,
    },
  },
  {
    id: 'dsh-offpeak#offpeak/updateSettings',
    service: 'offpeak',
    namespace: 'offpeak',
    method: 'updateSettings',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'update',
        wire: 'update',
        source: 'json',
        codec: {
          mode: 'strict',
          typeSymbol: 'dsh-offpeak#OffpeakSettingsUpdate',
          schema: offpeakSettingsUpdateSchema,
        },
      },
    ],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-offpeak#OffpeakSettings',
      schema: offpeakSettingsSchema,
    },
  },
]
