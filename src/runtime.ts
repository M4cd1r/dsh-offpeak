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
import { applySettingsUpdate, normalizeOffpeakSettings } from './defaults.ts'
import { nextSwitchAt, windowKindAt } from './pricing.ts'

/** Off-peak service: the durable pricing preferences, read and written. */
export class OffpeakRuntime extends TypertRemoteService {
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

  /** Live settings (schema defaults + user layer), completed for the wire. */
  settingsValue(): OffpeakSettings {
    return normalizeOffpeakSettings(this.settings.get())
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
   * status pill uses. Returns `null` for a provider this plugin does not know,
   * so a consumer can fall back instead of mislabelling the window.
   */
  windowKindFor(providerId: string, modelId?: string, at: Date = new Date()): OffpeakWindowKind | null {
    const profile = this.profileFor(providerId, modelId)
    if (profile === undefined) return null
    return windowKindAt(at, profile.peakWindows)
  }

  /**
   * Next switch for one provider/model pair, or `null` when the provider is
   * unknown or bills a flat rate (no switch is ever scheduled).
   */
  nextSwitchFor(providerId: string, modelId?: string, at: Date = new Date()): { at: Date; to: OffpeakWindowKind } | null {
    const profile = this.profileFor(providerId, modelId)
    if (profile === undefined) return null
    return nextSwitchAt(at, profile.peakWindows)
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