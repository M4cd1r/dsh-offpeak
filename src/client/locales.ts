/**
 * dsh-offpeak locale dictionaries. The namespace key is `offpeak`; both
 * dictionaries must declare exactly the same keys (enforced by the typed
 * registration site and by tests/locales.test.ts).
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** The plugin's locale namespace. */
export const NS = 'offpeak'

/** English dictionary. */
export const en = {
  'window.peak': 'Peak',
  'window.offpeak': 'Off-peak',
  'window.flat': 'Flat',
  'pill.aria': '{provider} pricing window: {window} (×{multiplier}). Next switch in {countdown}.',
  'pill.multiplier': '×{multiplier}',
  'pill.countdown': '{countdown} until {window}',
  'pill.flat': 'no peak pricing',
  'tooltip.nextSwitch': 'Now {window}: switch to {nextWindow} in {countdown}',
  'tooltip.effectivePrices': 'Effective prices (per 1M tokens)',
  'tooltip.input': 'Input',
  'tooltip.cacheHit': 'Cache hit',
  'tooltip.output': 'Output',
  'tooltip.switchAt': '{window} starts at',
  'tooltip.flat': 'This provider bills a flat rate — no peak window is configured.',
  'tooltip.pricesUnset': 'No per-token prices set (subscription plan)',
  'tooltip.provider': 'Provider',
  'tooltip.windows': 'Peak windows',
  'settings.title': 'Off-peak',
  'settings.subtitle': 'Per-provider peak windows, multipliers and prices — the pill reads the active provider.',
  'settings.enabled': 'Show the pricing pill',
  'settings.enabledDesc': 'Shows the live window readout under the composer.',
  'settings.activeProvider': 'Provider shown by the pill',
  'settings.activeProviderDesc': 'Each provider keeps its own off-peak window, multiplier and prices.',
  'settings.providers': 'Provider off-peak profiles',
  'settings.providersDesc': 'Peak windows are stated in UTC because every gateway publishes them that way. A provider with no window bills a flat rate.',
  'settings.providerEnabled': 'Peak / off-peak pricing',
  'settings.providerEnabledDesc': 'Off: the provider bills a flat rate and the pill never claims a countdown.',
  'settings.windows': 'Peak windows (UTC)',
  'settings.windowsHint': 'A day qualifier then HH:MM-HH:MM ranges in UTC, e.g. Mon-Fri 01:00-04:00, 06:00-10:00. No qualifier = every day. Empty = flat rate.',
  'settings.windowsInvalid': 'Unrecognised range — use Mon-Fri HH:MM-HH:MM in UTC.',
  'settings.flatBadge': 'flat rate',
  'settings.pricing': 'Pricing',
  'settings.pricingDesc': 'Base (off-peak) prices in USD per 1M tokens; the peak multiplier applies inside a peak window. Official prices change — keep these current with your provider.',
  'settings.currency': 'Display currency',
  'settings.currencyUsd': 'USD ($)',
  'settings.currencyCny': 'CNY (¥)',
  'settings.cnyPerUsd': 'USD → CNY rate',
  'settings.inputPrice': 'Input price (cache miss)',
  'settings.cacheHitPrice': 'Cache-hit price',
  'settings.outputPrice': 'Output price',
  'settings.peakMultiplier': 'Peak multiplier',
  'settings.peakMultiplierDesc': 'Price factor applied inside a peak window. DeepSeek official value: 2.',
  'settings.displayOffset': 'Display timezone (UTC offset, minutes)',
  'settings.displayOffsetHint': 'Used to show the switch time, e.g. 480 = UTC+8 (Asia/Shanghai). Windows themselves are defined in UTC.',
  'settings.saving': 'Saving…',
  'currencySymbolUsd': '$',
  'currencySymbolCny': '¥',
} as const

/** Chinese dictionary. */
export const zh = {
  'window.peak': '高峰',
  'window.offpeak': '错峰',
  'window.flat': '平价',
  'pill.aria': '{provider} 计价时段：{window}（×{multiplier}），{countdown} 后切换。',
  'pill.multiplier': '×{multiplier}',
  'pill.countdown': '{countdown} 后切换{window}',
  'pill.flat': '无峰谷计价',
  'tooltip.nextSwitch': '当前{window}，{countdown} 后切换{nextWindow}',
  'tooltip.effectivePrices': '当前有效价格（每 1M tokens）',
  'tooltip.input': '输入',
  'tooltip.cacheHit': '缓存命中',
  'tooltip.output': '输出',
  'tooltip.switchAt': '{window}开始于',
  'tooltip.flat': '该提供方为平价计费，未配置高峰时段。',
  'tooltip.pricesUnset': '未设置按 token 价格（订阅制套餐）',
  'tooltip.provider': '提供方',
  'tooltip.windows': '高峰时段',
  'settings.title': '错峰计价',
  'settings.subtitle': '按提供方分别配置高峰时段、倍率与价格——浮标读取当前提供方。',
  'settings.enabled': '显示计价浮标',
  'settings.enabledDesc': '在输入框下方显示当前时段。',
  'settings.activeProvider': '浮标显示的提供方',
  'settings.activeProviderDesc': '每个提供方各自维护错峰时段、倍率与价格。',
  'settings.providers': '提供方错峰配置',
  'settings.providersDesc': '高峰时段以 UTC 表示（各家官方均以 UTC 公布）。未配置时段的提供方按平价计费。',
  'settings.providerEnabled': '峰谷计价',
  'settings.providerEnabledDesc': '关闭后该提供方按平价计费，浮标也不再显示倒计时。',
  'settings.windows': '高峰时段（UTC）',
  'settings.windowsHint': '先写星期限定，再用逗号分隔 HH:MM-HH:MM（UTC），例如 Mon-Fri 01:00-04:00, 06:00-10:00。不写限定表示每天。留空表示平价。',
  'settings.windowsInvalid': '无法识别的时段，请使用 Mon-Fri HH:MM-HH:MM（UTC）。',
  'settings.flatBadge': '平价',
  'settings.pricing': '计价',
  'settings.pricingDesc': '基础（错峰）价格，单位 USD / 1M tokens；高峰时段按倍率计价。官方价格会调整，请以提供方计价页为准。',
  'settings.currency': '显示货币',
  'settings.currencyUsd': '美元（$）',
  'settings.currencyCny': '人民币（¥）',
  'settings.cnyPerUsd': '美元→人民币汇率',
  'settings.inputPrice': '输入价格（缓存未命中）',
  'settings.cacheHitPrice': '缓存命中价格',
  'settings.outputPrice': '输出价格',
  'settings.peakMultiplier': '高峰倍率',
  'settings.peakMultiplierDesc': '高峰时段的价格倍率。DeepSeek 官方值为 2。',
  'settings.displayOffset': '显示时区（UTC 偏移，分钟）',
  'settings.displayOffsetHint': '用于展示切换时间，如 480 = UTC+8（北京时间）。时段本身按 UTC 定义。',
  'settings.saving': '保存中…',
  'currencySymbolUsd': '$',
  'currencySymbolCny': '¥',
} as const

/** Typed dictionary union for the `offpeak` namespace. */
export type OffpeakKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    offpeak: OffpeakKey
  }
}
