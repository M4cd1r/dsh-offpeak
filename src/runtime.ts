/**
 * The dsh-offpeak host Remote service (`ctx.offpeak`, wire namespace
 * `offpeak`). Registered as a TypertRemoteService so the Host Gateway's
 * source-mode discovery exports its @Remote methods to the Web client under
 * `/api/offpeak/<method>` with zero generated artifacts.
 *
 * The service owns nothing but the durable settings: the pricing engine is
 * pure and the browser bundles the same copy, so the pill derives the window,
 * the countdown, and the effective prices locally from these values and its
 * own clock. Nothing here is persisted outside the settings store.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { OffpeakProviderProfile, OffpeakSettings, OffpeakSettingsUpdate, OffpeakWindowKind } from './contract.ts'
import {
  applySettingsUpdate,
  hasLegacyPricing,
  normalizeOffpeakSettings,
  type StoredOffpeakSection,
} from './defaults.ts'
import { nextSwitchAt, windowKindAt } from './pricing.ts'
import { OFFPEAK_NAMESPACE } from './settings.ts'

/** One raw-section read for the migration path: the stored user layer and the revision it was read at. */
interface StoredSection {
  readonly section: StoredOffpeakSection
  readonly revision: number
}

/** Off-peak service: the durable pricing preferences, read and written. */
export class OffpeakRuntime extends TypertRemoteService {
  /** Whether a legacy purge write is still in flight (the single-shot guard). */
  private purgePending = false

  /**
   * Register the service under the `offpeak` key (the wire namespace).
   * @param ctx - owning cordis context.
   * @param settings - the live settings scope.
   */
  constructor(
    ctx: Context,
    private readonly settings: SettingsScope<OffpeakSettings>,
  ) {
    super(ctx, 'offpeak')
  }

  /**
   * Live settings (schema defaults + user layer), completed for the wire:
   * legacy pricing migrated against the raw stored section, holiday entries
   * repaired to `YYYY-MM-DD`, and — when the stored section still carries the
   * legacy keys — a single-shot write that purges them (see
   * {@link purgeLegacyPricing}).
   */
  settingsValue(): OffpeakSettings {
    const section = this.settings.get()
    const stored = this.storedSection()
    const normalized = normalizeOffpeakSettings(section, stored?.section)
    if (stored !== undefined) this.purgeLegacyPricing(stored, normalized)
    return normalized
  }

  /**
   * The raw user layer for the `offpeak` namespace exactly as
   * `ctx.settings.describe()` reports it — the stored section WITHOUT schema
   * defaults, so key presence marks what the user explicitly stored — plus
   * the revision it was read at, for the purge's write guard. Any failure
   * (no settings provider, namespace unregistered) yields `undefined`: the
   * read then migrates without a stored view and skips the purge. Nothing
   * here may throw into a read path.
   */
  private storedSection(): StoredSection | undefined {
    try {
      const descriptor = this.ctx.settings.describe().find(entry => entry.ns === OFFPEAK_NAMESPACE)
      if (descriptor === undefined) return undefined
      const user = descriptor.user
      if (user === undefined || user === null || typeof user !== 'object') return undefined
      return { section: user as StoredOffpeakSection, revision: descriptor.revision }
    } catch {
      return undefined
    }
  }

  /**
   * One-shot legacy purge: while the stored section still carries the v0.1.0
   * top-level pricing keys, rewrite it once so they cannot resurface on later
   * reads — the scope's `update` merges and can never remove a key, so the
   * write goes through `replace()`, the only dsh-settings op that does.
   *
   * The payload is the raw stored section minus the four legacy keys, with
   * the migrated provider list written in their place — the values survive,
   * the keys do not, and any other stored key is left alone. Properties:
   *
   * - **Single-shot**: the in-flight flag collapses concurrent reads, and
   *   once the write lands the trigger (legacy keys present) is gone, so the
   *   read path settles into a write-free steady state — no write loop.
   * - **Revision-guarded**: the write carries the revision `describe()`
   *   reported, so a write that raced the read is refused as a
   *   `SettingsConflictError` instead of clobbering it.
   * - **Failure-tolerant**: a refused, rejected, or synchronously throwing
   *   write is swallowed here; the read still returns its migrated value,
   *   and the purge retries on a later read for as long as the keys remain.
   */
  private purgeLegacyPricing(stored: StoredSection, normalized: OffpeakSettings): void {
    if (this.purgePending || !hasLegacyPricing(stored.section)) return
    this.purgePending = true
    const settle = (): void => { this.purgePending = false }
    try {
      const { inputPricePerM, cacheHitPricePerM, outputPricePerM, peakMultiplier, ...clean } = stored.section
      void this.ctx.settings
        .replace(OFFPEAK_NAMESPACE, { ...clean, providers: normalized.providers }, stored.revision)
        .then(settle, settle)
    } catch {
      settle()
    }
  }

  /**
   * Exact profile for one provider id, or `undefined` when the provider is not
   * configured. The model id is accepted for forward compatibility; schedules
   * are provider-scoped today, so an unknown model still resolves its provider.
   * Consumers that must not silently inherit another provider's schedule rely
   * on the `undefined` result.
   */
  profileFor(providerId: string, _modelId?: string): OffpeakProviderProfile | undefined {
    return this.settingsValue().providers.find(provider => provider.id === providerId)
  }

  /**
   * Classify one provider/model pair at an instant with the same engine the
   * status pill uses, holidays included. Returns `null` for a provider this
   * plugin does not know, so a consumer can fall back instead of mislabelling
   * the window.
   */
  windowKindFor(providerId: string, modelId?: string, at: Date = new Date()): OffpeakWindowKind | null {
    const profile = this.profileFor(providerId, modelId)
    if (profile === undefined) return null
    return windowKindAt(at, profile.peakWindows, profile.holidays)
  }

  /**
   * Next aggregate-kind switch for one provider/model pair, or `null` when the
   * provider is unknown or its kind never changes (a flat rate schedules no
   * switch).
   */
  nextSwitchFor(providerId: string, modelId?: string, at: Date = new Date()): { at: Date; to: OffpeakWindowKind } | null {
    const profile = this.profileFor(providerId, modelId)
    if (profile === undefined) return null
    return nextSwitchAt(at, profile.peakWindows, profile.holidays)
  }

  /* ---------------- Remote surface (wire namespace `offpeak`) ---------------- */

  /** Read the resolved durable settings. */
  @Remote
  getSettings(): OffpeakSettings {
    return this.settingsValue()
  }

  /** Persist one settings field and return the resolved section. */
  @Remote
  updateSettings(update: OffpeakSettingsUpdate): Promise<OffpeakSettings> {
    return this.settings.update(applySettingsUpdate(this.settingsValue(), update)).then(() => this.settingsValue())
  }
}