/**
 * The Off-peak settings section (`settings.section`): display preferences plus
 * one editable profile per provider, because peak windows, multipliers and
 * prices are properties of the gateway, not of the plugin. Every write goes
 * through the injected business face (which persists via the host Remote);
 * components never touch ctx.
 */
import { useState, type ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OffpeakDay, OffpeakProviderProfile, PeakWindowSpec } from '../contract.ts'
import { formatDays, parseClock, parseDays } from '../pricing.ts'
import type { OffpeakSettingsSource } from './OffpeakPill.tsx'

/** Injected business face: the live settings source plus the durable write. */
export interface OffpeakSectionInjected {
  hooks: {
    settings: OffpeakSettingsSource
  }
  updateField: (field: string, value: unknown) => Promise<void>
}

/** Full section props: runtime share + injected face + locale seat. */
export type OffpeakSectionProps = PropsRuntime<'settings.section'> & InjectFace<OffpeakSectionInjected> & PropsLocale<'offpeak'>

/** Common UTC offsets offered in the display-timezone select. */
const OFFSET_OPTIONS: readonly { value: number; label: string }[] = [
  { value: -720, label: 'UTC−12' },
  { value: -600, label: 'UTC−10' },
  { value: -480, label: 'UTC−8' },
  { value: -300, label: 'UTC−5' },
  { value: 0, label: 'UTC±0' },
  { value: 60, label: 'UTC+1' },
  { value: 120, label: 'UTC+2' },
  { value: 330, label: 'UTC+5:30' },
  { value: 480, label: 'UTC+8 (北京/Asia/Shanghai)' },
  { value: 540, label: 'UTC+9 (東京/Seoul)' },
  { value: 600, label: 'UTC+10' },
]

/** One `HH:MM-HH:MM` range inside the editable window text. */
const RANGE_PATTERN = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/u

/** The spelled-out qualifier equivalent to "no day list". */
const EVERY_DAY_WORDS = ['every', 'day'] as const

/** Render a window list as the editable `Mon-Fri 01:00-04:00, 06:00-10:00` text. */
export function windowsToText(windows: readonly PeakWindowSpec[]): string {
  const groups: { qualifier: string | undefined; ranges: string[] }[] = []
  for (const window of windows) {
    const days = window.days ?? []
    const qualifier = days.length > 0 && days.length < 7 ? formatDays(days) : undefined
    const range = `${window.start}-${window.end}`
    const last = groups.at(-1)
    // Consecutive windows sharing a day list are printed behind one qualifier.
    if (last !== undefined && last.qualifier === qualifier) {
      last.ranges.push(range)
      continue
    }
    groups.push({ qualifier, ranges: [range] })
  }
  return groups
    .map(group => (group.qualifier === undefined ? group.ranges.join(', ') : `${group.qualifier} ${group.ranges.join(', ')}`))
    .join(', ')
}

/**
 * Parse the editable window text: an optional day qualifier followed by one or
 * more `HH:MM-HH:MM` ranges, comma-separated. A qualifier applies to every
 * range that follows it until the next qualifier, which is what makes
 * `Mon-Fri 01:00-04:00, 06:00-10:00` two weekday windows.
 * @param text - the raw text.
 * @returns the parsed windows, or `undefined` when any part is malformed.
 */
export function textToWindows(text: string): PeakWindowSpec[] | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return []
  const windows: PeakWindowSpec[] = []
  let days: OffpeakDay[] = []
  for (const chunk of trimmed.split(',')) {
    const part = chunk.trim()
    if (part === '') continue
    const tokens = part.split(/\s+/u)
    const qualifier = takeQualifier(tokens)
    if (qualifier === undefined) return undefined
    // A chunk with no qualifier of its own keeps the previous one, which is how
    // `Mon-Fri 01:00-04:00, 06:00-10:00` stays two weekday windows.
    if (qualifier !== null) days = qualifier
    // Ranges are taken from the end so the window order stays left to right.
    const ranges: PeakWindowSpec[] = []
    for (let token = tokens.pop(); token !== undefined; token = tokens.pop()) {
      const range = parseRange(token)
      if (range === undefined) return undefined
      ranges.unshift({ ...range, days })
    }
    windows.push(...ranges)
  }
  return windows.length > 0 ? windows : undefined
}

/**
 * Consume a leading day qualifier from a chunk's tokens.
 * @param tokens - the whitespace-split tokens, mutated in place.
 * @returns the qualifier's days — empty for an explicit `every day` — or `null`
 *          when the chunk carries no qualifier, or `undefined` when the leading
 *          text is neither a qualifier nor a range.
 */
function takeQualifier(tokens: string[]): OffpeakDay[] | null | undefined {
  const first = tokens[0]
  if (first === undefined || RANGE_PATTERN.exec(first) !== null) return null
  if (first.toLowerCase() === EVERY_DAY_WORDS[0] && tokens[1]?.toLowerCase() === EVERY_DAY_WORDS[1]) {
    tokens.shift()
    tokens.shift()
    return []
  }
  const parsed = parseDays(first)
  if (parsed === undefined) return undefined
  tokens.shift()
  return parsed
}

/** Parse one `HH:MM-HH:MM` token (an en dash is accepted). */
function parseRange(token: string): { start: string; end: string } | undefined {
  const match = RANGE_PATTERN.exec(token)
  if (match === null) return undefined
  const start = match[1] as string
  const end = match[2] as string
  if (parseClock(start) === undefined || parseClock(end) === undefined) return undefined
  return { start, end }
}

/** Render the Off-peak settings section. */
export function OffpeakSection({ useSettings, updateField, t }: OffpeakSectionProps): ReactElement {
  const settings = useSettings(snapshot => snapshot.value)
  const [savingField, setSavingField] = useState<string | undefined>(undefined)

  const write = async (field: string, value: unknown): Promise<void> => {
    setSavingField(field)
    try {
      await updateField(field, value)
    } finally {
      setSavingField(undefined)
    }
  }

  const busy = savingField !== undefined
  const writeProvider = async (profile: OffpeakProviderProfile): Promise<void> => {
    await write('provider', profile)
  }

  return (
    <section className="dsh_offpeak_theme dsh_offpeak_section" aria-labelledby="dsh-offpeak-settings-title">
      <div>
        <h2 id="dsh-offpeak-settings-title" className="dsh_offpeak_sectionTitle">{t('settings.title')}</h2>
        <p className="dsh_offpeak_sectionSubtitle">{t('settings.subtitle')}</p>
      </div>

      <label className="dsh_offpeak_toggle">
        <span className="dsh_offpeak_toggleText">
          <span className="dsh_offpeak_toggleLabel">{t('settings.enabled')}</span>
          <span className="dsh_offpeak_toggleDesc">{t('settings.enabledDesc')}</span>
        </span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={event => { void write('enabled', event.target.checked) }}
        />
        <span className="dsh_offpeak_switch" aria-hidden="true" />
      </label>

      <div className="dsh_offpeak_card">
        <h3 className="dsh_offpeak_cardTitle">
          {t('settings.activeProvider')}
          {busy && <span className="dsh_offpeak_saveState">{t('settings.saving')}</span>}
        </h3>
        <p className="dsh_offpeak_cardDesc">{t('settings.activeProviderDesc')}</p>
        <div className="dsh_offpeak_form">
          <div className="dsh_offpeak_field">
            <select
              className="dsh_offpeak_select"
              value={settings.activeProviderId}
              disabled={busy}
              onChange={event => { void write('activeProviderId', event.target.value) }}
            >
              {settings.providers.map(provider => (
                <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="dsh_offpeak_card">
        <h3 className="dsh_offpeak_cardTitle">{t('settings.providers')}</h3>
        <p className="dsh_offpeak_cardDesc">{t('settings.providersDesc')}</p>
        <div className="dsh_offpeak_providerList">
          {settings.providers.map(provider => (
            <ProviderCard
              key={provider.id}
              profile={provider}
              busy={busy}
              t={t}
              onSave={writeProvider}
            />
          ))}
        </div>
      </div>

      <div className="dsh_offpeak_card">
        <h3 className="dsh_offpeak_cardTitle">{t('settings.pricing')}</h3>
        <p className="dsh_offpeak_cardDesc">{t('settings.pricingDesc')}</p>
        <div className="dsh_offpeak_form">
          <div className="dsh_offpeak_field">
            <span className="dsh_offpeak_fieldLabel">{t('settings.currency')}</span>
            <select
              className="dsh_offpeak_select"
              value={settings.currency}
              disabled={busy}
              onChange={event => { void write('currency', event.target.value) }}
            >
              <option value="USD">{t('settings.currencyUsd')}</option>
              <option value="CNY">{t('settings.currencyCny')}</option>
            </select>
          </div>
          {settings.currency === 'CNY' && (
            <div className="dsh_offpeak_field">
              <span className="dsh_offpeak_fieldLabel">{t('settings.cnyPerUsd')}</span>
              <input
                className="dsh_offpeak_input"
                type="number"
                min={0}
                step={0.01}
                value={settings.cnyPerUsd}
                disabled={busy}
                onChange={event => { void write('cnyPerUsd', Number(event.target.value)) }}
              />
            </div>
          )}
          <div className="dsh_offpeak_field">
            <span className="dsh_offpeak_fieldLabel">{t('settings.displayOffset')}</span>
            <select
              className="dsh_offpeak_select"
              value={settings.displayUtcOffsetMinutes}
              disabled={busy}
              onChange={event => { void write('displayUtcOffsetMinutes', Number(event.target.value)) }}
            >
              {OFFSET_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className="dsh_offpeak_fieldHint">{t('settings.displayOffsetHint')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** One provider's editable profile card. */
function ProviderCard({
  profile,
  busy,
  t,
  onSave,
}: {
  profile: OffpeakProviderProfile
  busy: boolean
  t: OffpeakSectionProps['t']
  onSave: (profile: OffpeakProviderProfile) => Promise<void>
}): ReactElement {
  const [windowsDraft, setWindowsDraft] = useState(() => windowsToText(profile.peakWindows))
  const parsed = textToWindows(windowsDraft)
  const invalid = parsed === undefined

  /** Commit the draft windows when they parse. */
  const commitWindows = (text: string): void => {
    setWindowsDraft(text)
    const windows = textToWindows(text)
    if (windows === undefined) return
    void onSave({ ...profile, peakWindows: windows })
  }

  const patch = (fields: Partial<OffpeakProviderProfile>): void => {
    void onSave({ ...profile, ...fields })
  }

  return (
    <div className="dsh_offpeak_providerCard" data-enabled={profile.enabled ? 'true' : 'false'}>
      <div className="dsh_offpeak_providerHeader">
        <input
          className="dsh_offpeak_input dsh_offpeak_providerLabel"
          type="text"
          value={profile.label}
          disabled={busy}
          aria-label={t('settings.providers')}
          onChange={event => { patch({ label: event.target.value }) }}
        />
        <code className="dsh_offpeak_providerId">{profile.id}</code>
        {!profile.enabled && <span className="dsh_offpeak_badge">{t('settings.flatBadge')}</span>}
      </div>

      <label className="dsh_offpeak_toggle dsh_offpeak_toggleCompact">
        <span className="dsh_offpeak_toggleText">
          <span className="dsh_offpeak_toggleLabel">{t('settings.providerEnabled')}</span>
          <span className="dsh_offpeak_toggleDesc">{t('settings.providerEnabledDesc')}</span>
        </span>
        <input
          type="checkbox"
          checked={profile.enabled}
          onChange={event => { patch({ enabled: event.target.checked }) }}
        />
        <span className="dsh_offpeak_switch" aria-hidden="true" />
      </label>

      <div className="dsh_offpeak_form">
        <div className="dsh_offpeak_field dsh_offpeak_fieldWide">
          <span className="dsh_offpeak_fieldLabel">{t('settings.windows')}</span>
          <input
            className="dsh_offpeak_input"
            type="text"
            value={windowsDraft}
            disabled={busy || !profile.enabled}
            placeholder="Mon-Fri 01:00-04:00, 06:00-10:00"
            aria-invalid={invalid}
            onChange={event => { commitWindows(event.target.value) }}
          />
          <span className="dsh_offpeak_fieldHint">
            {invalid ? t('settings.windowsInvalid') : t('settings.windowsHint')}
          </span>
        </div>
        <div className="dsh_offpeak_field">
          <span className="dsh_offpeak_fieldLabel">{t('settings.peakMultiplier')}</span>
          <input
            className="dsh_offpeak_input"
            type="number"
            min={1}
            max={100}
            step={0.5}
            value={profile.peakMultiplier}
            disabled={busy || !profile.enabled}
            onChange={event => { patch({ peakMultiplier: Number(event.target.value) }) }}
          />
          <span className="dsh_offpeak_fieldHint">{t('settings.peakMultiplierDesc')}</span>
        </div>
        <div className="dsh_offpeak_field">
          <span className="dsh_offpeak_fieldLabel">{t('settings.inputPrice')}</span>
          <input
            className="dsh_offpeak_input"
            type="number"
            min={0}
            step={0.001}
            value={profile.inputPricePerM}
            disabled={busy}
            onChange={event => { patch({ inputPricePerM: Number(event.target.value) }) }}
          />
        </div>
        <div className="dsh_offpeak_field">
          <span className="dsh_offpeak_fieldLabel">{t('settings.cacheHitPrice')}</span>
          <input
            className="dsh_offpeak_input"
            type="number"
            min={0}
            step={0.001}
            value={profile.cacheHitPricePerM}
            disabled={busy}
            onChange={event => { patch({ cacheHitPricePerM: Number(event.target.value) }) }}
          />
        </div>
        <div className="dsh_offpeak_field">
          <span className="dsh_offpeak_fieldLabel">{t('settings.outputPrice')}</span>
          <input
            className="dsh_offpeak_input"
            type="number"
            min={0}
            step={0.001}
            value={profile.outputPricePerM}
            disabled={busy}
            onChange={event => { patch({ outputPricePerM: Number(event.target.value) }) }}
          />
        </div>
      </div>
    </div>
  )
}
