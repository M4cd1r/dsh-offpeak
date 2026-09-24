/**
 * The composer-dock status pill: a live readout of the *active provider's*
 * pricing window. It sits in `conversation.composer.dock` (the band under the
 * composer card), computes everything locally from the shared pure pricing
 * engine plus the settings fetched from the host, and reveals a detail
 * tooltip on hover/focus. Renders nothing while disabled.
 *
 * A provider with peak/off-peak billing off (a flat-rate gateway such as
 * OpenCode Go) renders the same pill in its "flat" state: multiplier 1, no
 * countdown, and no peak styling.
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { OffpeakProviderProfile, OffpeakSettings } from '../contract.ts'
import { resolveActiveProfile } from '../defaults.ts'
import { formatDuration, formatWallClock, formatWindowsWithDays, nextSwitchAt, windowKindAt } from '../pricing.ts'
import { MoonIcon, PulseDot, SunIcon } from './icons.tsx'
import type { OffpeakKey } from './locales.ts'

export interface OffpeakSettingsSnapshot { readonly value: OffpeakSettings }

export type OffpeakSettingsSource = ObservableSnapshot<OffpeakSettingsSnapshot>

/** Injected business face: the live settings source. */
export interface OffpeakPillInjected {
  hooks: {
    settings: OffpeakSettingsSource
  }
}

/** Full pill entry props: composer-dock owner share + session standard kit + injected face + locale seat. */
export type OffpeakPillProps = PropsRuntime<'conversation.composer.dock'> & InjectFace<OffpeakPillInjected> & PropsLocale<'offpeak'>

/** How often the countdown re-renders. */
const TICK_MS = 1000

/** Whether a profile actually bills peak windows. */
export function billsPeak(profile: OffpeakProviderProfile): boolean {
  return profile.enabled && profile.peakWindows.length > 0
}

/**
 * Render the live pricing pill; null while the settings switch is off.
 * @param props - runtime share, inject hooks, and locale seat.
 * @returns the pill, or null.
 */
export function OffpeakPill({ useSettings, t }: OffpeakPillProps): ReactElement | null {
  const settings = useSettings(snapshot => snapshot.value)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()) }, TICK_MS)
    return () => { window.clearInterval(timer) }
  }, [])

  if (!settings.enabled) return null

  const profile = resolveActiveProfile(settings)
  const peakBilling = billsPeak(profile)
  const date = new Date(now)
  const win = peakBilling ? windowKindAt(date, profile.peakWindows, profile.holidays) : 'offpeak'
  const multiplier = peakBilling && win === 'peak' ? profile.peakMultiplier : 1
  const next = peakBilling ? nextSwitchAt(date, profile.peakWindows, profile.holidays) : null
  const countdown = next === null ? '' : formatDuration(Math.max(0, next.at.getTime() - now))
  const symbol = settings.currency === 'CNY' ? t('currencySymbolCny') : t('currencySymbolUsd')
  const windowKey: OffpeakKey = !peakBilling ? 'window.flat' : win === 'peak' ? 'window.peak' : 'window.offpeak'
  const nextKey: OffpeakKey | undefined = next === null ? undefined : next.to === 'peak' ? 'window.peak' : 'window.offpeak'

  /** One effective price, in the display currency. */
  const price = (basePerM: number): string => {
    const usd = basePerM * multiplier
    if (settings.currency === 'CNY') return `${symbol}${(usd * settings.cnyPerUsd).toFixed(4)}`
    return `${symbol}${usd.toFixed(4)}`
  }

  // A subscription plan has no per-token price; showing zeros would read as a
  // free model, so the whole price block is replaced by an explicit note.
  const hasPrices = profile.inputPricePerM > 0 || profile.cacheHitPricePerM > 0 || profile.outputPricePerM > 0

  const aria = nextKey === undefined
    ? t('pill.aria', { provider: profile.label, window: t(windowKey), multiplier: String(multiplier), countdown: '' })
    : t('pill.aria', { provider: profile.label, window: t(windowKey), multiplier: String(multiplier), countdown })

  return (
    <div
      className="dsh_offpeak_theme dsh_offpeak_pill"
      data-window={win}
      data-flat={peakBilling ? 'false' : 'true'}
      role="status"
      tabIndex={0}
      aria-label={aria}
    >
      <PulseDot className="dsh_offpeak_pulse" />
      {win === 'peak' ? <SunIcon className="dsh_offpeak_pillIcon" /> : <MoonIcon className="dsh_offpeak_pillIcon" />}
      <span className="dsh_offpeak_pillProvider">{profile.label}</span>
      <span className="dsh_offpeak_pillLabel">{t(windowKey)}</span>
      <span className="dsh_offpeak_pillMultiplier">{t('pill.multiplier', { multiplier: String(multiplier) })}</span>
      {nextKey === undefined
        ? <span className="dsh_offpeak_pillCountdown">{t('pill.flat')}</span>
        : <span className="dsh_offpeak_pillCountdown">{t('pill.countdown', { countdown, window: t(nextKey) })}</span>}

      <div className="dsh_offpeak_tooltip" role="tooltip">
        <div className="dsh_offpeak_tooltipTitle">
          <span>{t(windowKey)} · ×{String(multiplier)}</span>
          <span className="dsh_offpeak_tooltipSwitch">
            {nextKey === undefined
              ? t('tooltip.flat')
              : t('tooltip.nextSwitch', { window: t(windowKey), nextWindow: t(nextKey), countdown })}
          </span>
        </div>
        <div className="dsh_offpeak_tooltipRow">
          <span className="dsh_offpeak_tooltipLabel">{t('tooltip.provider')}</span>
          <span className="dsh_offpeak_tooltipValue">{profile.label}</span>
        </div>
        {peakBilling && (
          <div className="dsh_offpeak_tooltipRow">
            <span className="dsh_offpeak_tooltipLabel">{t('tooltip.windows')}</span>
            <span className="dsh_offpeak_tooltipValue">
              {formatWindowsWithDays(profile.peakWindows, settings.displayUtcOffsetMinutes)}
              <span className="dsh_offpeak_tooltipZone">{offsetLabel(settings.displayUtcOffsetMinutes)}</span>
            </span>
          </div>
        )}
        {hasPrices
          ? (
              <>
                <div className="dsh_offpeak_tooltipRow">
                  <span className="dsh_offpeak_tooltipLabel">{t('tooltip.effectivePrices')}</span>
                  <span />
                </div>
                <div className="dsh_offpeak_tooltipRow">
                  <span className="dsh_offpeak_tooltipLabel">{t('tooltip.input')}</span>
                  <span className="dsh_offpeak_tooltipValue">{price(profile.inputPricePerM)}</span>
                </div>
                <div className="dsh_offpeak_tooltipRow">
                  <span className="dsh_offpeak_tooltipLabel">{t('tooltip.cacheHit')}</span>
                  <span className="dsh_offpeak_tooltipValue">{price(profile.cacheHitPricePerM)}</span>
                </div>
                <div className="dsh_offpeak_tooltipRow">
                  <span className="dsh_offpeak_tooltipLabel">{t('tooltip.output')}</span>
                  <span className="dsh_offpeak_tooltipValue">{price(profile.outputPricePerM)}</span>
                </div>
              </>
            )
          : (
              <div className="dsh_offpeak_tooltipRow">
                <span className="dsh_offpeak_tooltipLabel">{t('tooltip.pricesUnset')}</span>
                <span />
              </div>
            )}
        {next !== null && nextKey !== undefined && (
          <>
            <div className="dsh_offpeak_tooltipDivider" />
            <div className="dsh_offpeak_tooltipRow">
              <span className="dsh_offpeak_tooltipLabel">{t('tooltip.switchAt', { window: t(nextKey) })}</span>
              <span className="dsh_offpeak_tooltipValue">
                {formatWallClock(next.at, settings.displayUtcOffsetMinutes)}
                <span className="dsh_offpeak_tooltipZone">{offsetLabel(settings.displayUtcOffsetMinutes)}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Render a display offset as `UTC+8` / `UTC−5:30` / `UTC±0`. */
function offsetLabel(utcOffsetMinutes: number): string {
  if (utcOffsetMinutes === 0) return 'UTC±0'
  const sign = utcOffsetMinutes > 0 ? '+' : '−'
  const total = Math.abs(utcOffsetMinutes)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`
}
