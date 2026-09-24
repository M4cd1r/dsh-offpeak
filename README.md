# dsh-offpeak

English | [中文](README.zh.md)

[![CI](https://github.com/AlexShang1992/dsh-offpeak/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AlexShang1992/dsh-offpeak/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/AlexShang1992/dsh-offpeak?include_prereleases&sort=semver)](https://github.com/AlexShang1992/dsh-offpeak/releases)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A522.19-brightgreen)](package.json)

DeepSeek prices API usage in two weekday windows defined in UTC, and Z.ai prices its coding plan in a third. This plugin puts that fact where you can see it: one status pill under the composer of the DeepSeek Harness Web GUI, showing the active provider's current window, the price multiplier, and the countdown to the next switch — with the effective prices and the switch time on hover.

That is the whole plugin. It registers no tools and no commands, contributes nothing to any model request, stores no files, and makes no network calls.

| Peak window (×2) | Off-peak window (×1) |
| --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/pill-peak-dark.png"><img alt="The status pill during peak hours, with its detail tooltip open" src="docs/screenshots/en/pill-peak.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/pill-offpeak-dark.png"><img alt="The status pill during off-peak hours" src="docs/screenshots/en/pill-offpeak.png"></picture> |

## Pricing windows

Peak pricing is a property of the **provider**, and the shipped providers disagree, so every provider profile carries its own windows, multiplier, prices, and holiday calendar. Both shipped schedules are weekday-only: Saturday and Sunday are off-peak for each of them. DeepSeek additionally excludes Chinese public holidays: every date listed in its profile's `holidays` calendar is off-peak for the whole UTC day, whatever the window gates say.

| Provider | Peak hours (UTC) | Days | Holidays | Peak | Off-peak |
| --- | --- | --- | --- | --- | --- |
| DeepSeek | 01:00 – 04:00 and 06:00 – 10:00 | Mon – Fri | 2026 CN calendar | ×2 | ×1 |
| Z.ai (GLM coding plan) | 06:00 – 10:00 | Mon – Fri | none | ×3 quota | ×1 |
| OpenCode Go | — | — | — | flat rate | flat rate |

Those same hours in the providers' home timezones: DeepSeek peaks at 09:00 – 12:00 and 14:00 – 18:00 Beijing time (UTC+8), and Z.ai at 14:00 – 18:00 Singapore time (UTC+8) — so on a weekday afternoon the two overlap between 14:00 and 18:00 Beijing/Singapore.

`windowKindAt` classifies an instant by its UTC time of day, its UTC day of week, and the provider's holiday calendar; a window that wraps past midnight belongs to the day it starts on. `nextSwitchAt` reports the first instant the *aggregate* window kind actually changes, not merely the next raw boundary — adjacent (`01:00–04:00` + `04:00–06:00`) and overlapping (`01:00–05:00` + `04:00–06:00`) windows do not switch at their shared boundary, and a holiday that suppresses a would-be peak day pushes the next switch past the whole block. The shipped boundaries are fixed in `src/defaults.ts`:

- DeepSeek — <https://api-docs.deepseek.com/quick_start/pricing> (*"Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday"*, excluding Chinese public holidays)
- Z.ai — <https://docs.z.ai/devpack/overview> (*"Peak hours: Monday to Friday, 14:00–18:00 Singapore Standard Time (UTC+8)"*)

The DeepSeek `holidays` list is a **2026 snapshot** of the Chinese public-holiday calendar as UTC dates (`YYYY-MM-DD`), cross-checked against <https://www.timeanddate.com/holidays/china/2026>. It must be refreshed annually — nothing fetches the new calendar for you.

Every window, multiplier, price, and holiday list is editable in Settings; the values above are only the defaults.

The prices are **the ones you type in**, multiplied by the multiplier. The plugin reads no pricing page and no billing data, so an official price change is a change you have to make yourself.

## Installation

Requires a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web profile on Node.js ≥ 22.19.

```sh
dsh plugin --profile web add https://github.com/AlexShang1992/dsh-offpeak/releases/latest/download/dsh-offpeak.tgz
```

Every release carries that packed tarball; swap `latest` for a tag
(`.../download/v0.1.0/dsh-offpeak.tgz`) to pin one. The package is not on npm
yet.

Installing the `github:` reference directly does **not** work: the repository
ships no build output, so the package would have to build itself through its
`prepare` script, and pnpm 10 refuses to run a dependency's lifecycle scripts
unless the consuming project allowlists it. The tarball needs no build step.

Restart `dsh --profile web`. The pill appears under the composer inside a session; the pricing form appears under **Settings → Off-peak**.

## What the pill shows

The bar itself carries the current window, the multiplier as `×N`, and the time to the next switch. Hovering (or focusing — it is keyboard reachable and announces itself through `role="status"`) opens the detail panel: the effective price of input, cache-hit, and output tokens per 1M in the current window, and the wall-clock time the next window starts, in your display timezone.

Everything there is derived in the browser from the settings below and the browser's own clock, through the same pure module the host validates — so the pill cannot drift from the settings it reads.

The pill reads the profile selected by `activeProviderId`. Provider selection is **manual**: the pill does not infer the provider of the current session, so when you switch gateways you switch the setting too.

## Configuration

The `offpeak` settings namespace is registered with `applies: 'live'`: every field takes effect the moment you change it, with no restart.

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/settings-dark.png"><img alt="The Off-peak settings section" src="docs/screenshots/en/settings.png"></picture>

| Setting | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Show the pill |
| `currency` | `USD` | Display currency (`USD` or `CNY`, converted with `cnyPerUsd`) |
| `cnyPerUsd` | `7.1` | USD → CNY factor, used for display only |
| `displayUtcOffsetMinutes` | `480` | Offset used to display switch times; the windows themselves are UTC |
| `activeProviderId` | `deepseek-official` | Which provider profile the pill reads (manual — not inferred from the session) |
| `providers[]` | see above | One profile per gateway: label, enabled, `peakWindows`, `holidays`, `peakMultiplier`, and the three base prices |

Each provider profile holds its own `peakWindows`, `holidays`, `peakMultiplier`, `inputPricePerM`, `cacheHitPricePerM`, and `outputPricePerM`. A window is editable as text — a day qualifier followed by `HH:MM-HH:MM` ranges — so DeepSeek ships as `Mon-Fri 01:00-04:00, 06:00-10:00` and Z.ai as `Mon-Fri 06:00-10:00`. A range written with no qualifier applies every day; an empty field means the provider bills a flat rate, and the pill then shows no countdown.

Settings persisted by v0.1.0 carried the pricing values at the top level (`inputPricePerM`, `cacheHitPricePerM`, `outputPricePerM`, `peakMultiplier`). On read they are migrated onto the DeepSeek provider profile; a value already set on the provider in the new shape takes precedence, and the next settings write re-persists the clean per-provider shape.

The default DeepSeek prices are the official `deepseek-flash` off-peak prices in USD per 1M tokens: `0.15` input (cache miss), `0.003` cache hit, `0.6` output. The Z.ai profile ships no per-token prices, because a coding plan bills quota rather than tokens — only its multiplier is meaningful. On the day DeepSeek moves its prices, the defaults here go stale: they are editable, they are not fetched, and nothing verifies them.

## Composition

```yaml
- id: dsh-offpeak
  name: dsh-offpeak
```

`cordis.patch.yml` mounts that row after the Web app layer, so the profile's Loader resolves the package and the Web server serves the browser half from `/plugins/dsh-offpeak/client.js` — no second row is needed.

The host half injects `settings` and `typert`: it registers the settings namespace and mounts the `offpeak` Typert Remote service, whose entire surface is `getSettings` and `updateSettings`. The browser half injects `remote`, `slots`, `locale`, `sessions`, and `connection`, and contributes a `conversation.composer.dock` entry and a `settings.section` entry at order 40. Host and client share the zod codecs and invocation descriptors in `src/contract.ts`, so both calls are validated on the wire.

Settings persist through the harness's own settings provider under the `offpeak` namespace. The plugin writes no files of its own, and uninstalling it leaves nothing behind but that section.

## Model Experience

### What the model sees

Nothing. The plugin registers no tools, no commands, and no system-prompt section; it never calls `agent.steer()` and never appends to a session log. The pill is a browser-side rendering of settings the user typed, and the model has no way to observe that it exists.

### Token effect

Zero, in every request.

### KV Cache effect

None. The plugin contributes no request text, so it can neither extend nor invalidate a reusable prefix.

## Development

```sh
pnpm install          # also builds, through the prepare script
pnpm run check        # typecheck + test + lint + build, the CI gate
pnpm run test:watch
```

```
src/
  pricing.ts     pure window math and display helpers — host and browser
  defaults.ts    shipped provider profiles (official windows, multipliers, prices)
  contract.ts    wire contract: settings types, zod codecs, Typert invocations
  settings.ts    the `offpeak` settings namespace
  runtime.ts     OffpeakRuntime — the `offpeak` Typert Remote service
  index.ts       host plugin entry
  client/        browser half: status pill, settings section, en/zh dictionaries, styles
tests/           window boundaries, weekday gating, window text, the Remote surface,
                 stylesheet and locale contracts
scripts/         verify-schedule.mjs — the published schedules, checked against the
                 real engine through Node's native type stripping
```

Build output: `lib/index.js` (host ESM), `lib/client.js` (browser bundle), `lib/types/` (declarations).

Unit tests cannot see the seams that actually break — slot rendering, theme tokens, wire validation — so run the working copy in a real profile before trusting a change; [CONTRIBUTING.md](CONTRIBUTING.md) has the two commands. The screenshots in `docs/screenshots/` are captured from a running harness; see [docs/screenshots/README.md](docs/screenshots/README.md) before replacing them.

## Known Limitations and Deferred Work

- **The prices are yours, not DeepSeek's.** Nothing verifies them against the official pricing page or against what you were actually billed, so a stale table shows confidently wrong numbers.
- **The shipped schedule is a snapshot.** The defaults were read from each provider's pricing page at the time of writing; if a provider moves a window, edit the profile — the boundaries are settings now, not code.
- **The DeepSeek holiday calendar is a 2026 snapshot.** The shipped `holidays` list covers 2026 only and nothing refreshes it automatically; after each Chinese New Year the list goes stale until you (or a plugin update) replace it.
- **The day gate is UTC.** Weekdays and holiday dates are evaluated in UTC, not in the provider's home timezone. For both shipped schedules that is what the providers publish, but a window that crosses a UTC midnight into a different local weekday would need the day list spelled out by hand.
- **The pill counts down against the browser's clock.** A machine with a badly wrong clock shows a badly wrong window.
- **Web only.** The pill and the settings section are browser surfaces; a profile without the Web app loads the plugin and shows nothing.

## Security

Installing a plugin runs third-party code with your own permissions. This one writes no files, makes no network calls, and collects nothing; its only durable footprint is its own settings section. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Alex Shang. Not affiliated with DeepSeek.
