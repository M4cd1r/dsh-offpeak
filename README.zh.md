# dsh-offpeak

[English](README.md) | 中文

[![CI](https://github.com/AlexShang1992/dsh-offpeak/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AlexShang1992/dsh-offpeak/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/AlexShang1992/dsh-offpeak?include_prereleases&sort=semver)](https://github.com/AlexShang1992/dsh-offpeak/releases)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A522.19-brightgreen)](package.json)

DeepSeek 按 UTC 定义的两个工作日时段计价（法定节假日不计），Z.ai 的 Coding Plan 则是第三个时段。本插件把这件事放到你看得见的地方：在 DeepSeek Harness Web GUI 的输入框下方显示一个状态浮标，给出当前服务商（provider）的时段、价格倍率与距下次切换的倒计时；鼠标悬停时展开当前有效价格和切换时间。

插件就这些。它不注册任何工具与命令，不向任何模型请求贡献内容，不写任何文件，也不发起任何网络请求。

| 高峰时段（×2） | 错峰时段（×1） |
| --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/zh/pill-peak-dark.png"><img alt="高峰时段的状态浮标，悬停展开详情" src="docs/screenshots/zh/pill-peak.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/zh/pill-offpeak-dark.png"><img alt="错峰时段的状态浮标" src="docs/screenshots/zh/pill-offpeak.png"></picture> |

## 计价时段

高峰计价是**服务商**的属性，内置的几家各不相同，因此每个 provider 档案自带时段窗口、倍率、价格表和节假日日历。两家内置高峰时段都仅限工作日：周六、周日一律错峰。DeepSeek 还额外排除中国法定节假日：其档案 `holidays` 日历中列出的 UTC 日期全天错峰，不受时段窗口与星期门控影响。

| 服务商 | 高峰时段（UTC） | 星期 | 节假日 | 高峰 | 错峰 |
| --- | --- | --- | --- | --- | --- |
| DeepSeek | 01:00 – 04:00 与 06:00 – 10:00 | 周一 – 周五 | 2026 中国法定节假日 | ×2 | ×1 |
| Z.ai（GLM coding plan） | 06:00 – 10:00 | 周一 – 周五 | 无 | ×3 配额 | ×1 |
| OpenCode Go | — | — | — | 固定费率 | 固定费率 |

内置的固定费率档案是 **OpenCode Go**。**OpenCode Zen** 是另一款按量计费的产品、没有公开的高峰时段表，因此有意不纳入本插件的表示。

换算到各家本地时区：DeepSeek 高峰为北京时间（UTC+8）09:00 – 12:00 与 14:00 – 18:00，Z.ai 为新加坡时间（UTC+8）14:00 – 18:00——工作日下午两者在北京/新加坡时间的 14:00 – 18:00 重叠。

`windowKindAt` 依据 UTC 时刻、UTC 星期以及服务商的节假日日历归类；跨午夜的窗口归属于其开始日。`nextSwitchAt` 返回的是**聚合时段**真正发生变化的第一刻，而不是下一个原始边界——相邻（`01:00–04:00` + `04:00–06:00`）或重叠（`01:00–05:00` + `04:00–06:00`）的窗口在公共边界上不切换，节假日压制了某个本应高峰的日子时，下次切换会越过整个节假日区间。内置边界固定写在 `src/defaults.ts`：

- DeepSeek — <https://api-docs.deepseek.com/quick_start/pricing>（*"Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday"*，不含中国法定节假日）
- Z.ai — <https://docs.z.ai/devpack/overview>（*"Peak hours: Monday to Friday, 14:00–18:00 Singapore Standard Time (UTC+8)"*）

DeepSeek 的 `holidays` 列表是中国法定节假日的 **2026 年快照**（UTC 日期，`YYYY-MM-DD`），已与 <https://www.timeanddate.com/holidays/china/2026> 交叉核对。它需要每年手动刷新——没有任何机制会替你获取新日历。不符合 `YYYY-MM-DD` 的条目会被忽略而不是被采信，因此存储中的畸形日期永远不会破坏设置读取。

时段窗口、倍率、价格与节假日列表都可在设置中修改；以上数值只是默认值。

浮标显示的价格是**你自己填的价格**乘以倍率。插件不读取计价页，也不读取账单，因此官方调价后需要你自己更新。

## 安装

需要 Node.js ≥ 22.19 上的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web profile。

```sh
dsh plugin --profile web add https://github.com/AlexShang1992/dsh-offpeak/releases/latest/download/dsh-offpeak.tgz
```

每个 release 都会带上这个打包好的 tarball；把 `latest` 换成 tag
（`.../download/v0.1.0/dsh-offpeak.tgz`）即可钉住某个版本。本包尚未发布到 npm。

直接安装 `github:` 引用**不可行**：仓库不提交构建产物，包需要靠自己的 `prepare`
脚本构建，而 pnpm 10 默认拒绝执行依赖的生命周期脚本，除非使用方显式放行。
tarball 则不需要任何构建步骤。

重启 `dsh --profile web`。进入会话后浮标出现在输入框下方，计价表单出现在 **设置 → 错峰计价**。

## 浮标显示什么

横条本身显示当前时段、以 `×N` 表示的倍率，以及距下次切换的时间。悬停（或聚焦——它可由键盘访问，并通过 `role="status"` 播报）会展开详情面板：当前时段下输入、缓存命中、输出每 1M tokens 的有效价格，以及下一个时段开始的钟表时间（按你设置的显示时区）。

这些全部由浏览器根据下方设置和浏览器自身时钟推导得出，走的是 host 侧校验过的同一个纯模块——因此浮标不可能与它读取的设置脱节。

浮标读取的是 `activeProviderId` 选中的档案。服务商选择是**手动**的：浮标不会推断当前会话实际使用的服务商，切换网关时需要一并切换该设置。

## 配置

`offpeak` 设置命名空间以 `applies: 'live'` 注册：每个字段改动即刻生效，无需重启。

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/zh/settings-dark.png"><img alt="错峰计价设置面板" src="docs/screenshots/zh/settings.png"></picture>

| 设置项 | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 是否显示浮标 |
| `currency` | `USD` | 显示货币（`USD` 或 `CNY`，按 `cnyPerUsd` 换算） |
| `cnyPerUsd` | `7.1` | 美元→人民币系数，仅用于展示 |
| `displayUtcOffsetMinutes` | `480` | 展示切换时间所用的时区偏移；时段本身按 UTC 定义 |
| `activeProviderId` | `deepseek-official` | 浮标读取哪个服务商档案（手动选择，不从会话推断） |
| `providers[]` | 见上文 | 每个网关一份档案：label、enabled、`peakWindows`、`holidays`、`peakMultiplier` 与三档基础价 |

每个服务商档案自带 `peakWindows`、`holidays`、`peakMultiplier`、`inputPricePerM`、`cacheHitPricePerM` 和 `outputPricePerM`。时段窗口以文本编辑——星期限定词后跟 `HH:MM-HH:MM` 区间——因此 DeepSeek 默认为 `Mon-Fri 01:00-04:00, 06:00-10:00`，Z.ai 为 `Mon-Fri 06:00-10:00`。不带限定词的区间每天生效；留空表示该服务商为固定费率，浮标随之不再显示倒计时。

v0.1.0 持久化的设置把四个计价字段放在顶层（`inputPricePerM`、`cacheHitPricePerM`、`outputPricePerM`、`peakMultiplier`）。读取时它们会被迁移到 DeepSeek 服务商档案上：只要新结构在存储中**显式保存**了该字段，该值就始终优先——即使它恰好等于内置默认值；只有存储里没有该字段的值时，遗留值才会生效。升级后的第一次读取还会把存储中的这一段重写一次，删掉四个遗留顶层键，使它们无法在后续读取中复现；该写入带有并发写保护、绝不会让读取失败、在键存在期间每轮读取至多触发一次，且迁移后的值原样保留。

DeepSeek 档案的 `holidays` 列表是 2026 年中国法定节假日的 UTC 日期快照，**每年需要刷新一次**（在设置中改，或更新 `src/defaults.ts` 中的默认值），否则引擎会继续沿用上一年的节假日。

## 组合方式

```yaml
- id: dsh-offpeak
  name: dsh-offpeak
```

`cordis.patch.yml` 会把这一行挂载在 Web app 层之后，于是 profile 的 Loader 能解析到该包，Web 服务端也会从 `/plugins/dsh-offpeak/client.js` 提供浏览器侧代码——不需要第二行配置。

Host 侧注入 `settings` 与 `typert`：注册设置命名空间，并挂载 `offpeak` Typert Remote 服务，其全部接口就是 `getSettings` 和 `updateSettings`。浏览器侧注入 `remote`、`slots`、`locale`、`sessions`、`connection`，并以 order 40 向 `conversation.composer.dock` 与 `settings.section` 各贡献一个条目。Host 与 client 共用 `src/contract.ts` 中的 zod 编解码器与 invocation 描述符，两个调用都在传输层被校验。

设置通过 harness 自身的 settings provider 以 `offpeak` 命名空间持久化。插件不写任何自己的文件，卸载后除了那一段设置外不留痕迹。

## 模型体验

### 模型所见内容

无。插件不注册工具、不注册命令、不贡献系统提示词段落，既不调用 `agent.steer()`，也不向会话日志追加任何内容。浮标只是浏览器对用户所填设置的一次渲染，模型无从得知它存在。

### Token 影响

每次请求都是零。

### KV Cache 影响

无。插件不贡献任何请求文本，因此既不会延长也不会失效任何可复用前缀。

## 开发

```sh
pnpm install          # 通过 prepare 脚本顺带完成构建
pnpm run check        # typecheck + test + lint + build，与 CI 等价
pnpm run test:watch
```

```
src/
  pricing.ts     纯时段计算与展示助手——host 与浏览器共用
  defaults.ts    内置服务商档案（官方时段窗口、倍率、价格、节假日日历）
  contract.ts    传输契约：设置类型、zod 编解码器、Typert invocation
  settings.ts    `offpeak` 设置命名空间
  runtime.ts     OffpeakRuntime——`offpeak` Typert Remote 服务
  index.ts       host 插件入口
  client/        浏览器侧：状态浮标、设置面板、中英词典、样式
tests/           时段边界、Remote 接口、样式表与词典契约
```

构建产物：`lib/index.js`（host ESM）、`lib/client.js`（浏览器 bundle）、`lib/types/`（类型声明）。

单元测试看不到真正容易坏的接缝——插槽渲染、主题 token、传输校验——所以改动后请先在真实 profile 里跑一遍再下结论，两条命令见 [CONTRIBUTING.md](CONTRIBUTING.md)。`docs/screenshots/` 中的截图取自真实运行的 harness，替换前请先阅读 [docs/screenshots/README.md](docs/screenshots/README.md)。

## 已知限制与后续工作

- **价格是你填的，不是 DeepSeek 给的。** 没有任何机制会拿它与官方计价页或你的实际账单核对，价格表过期时显示的就是自信而错误的数字。
- **内置时段是快照。** 默认值撰写时读自各服务商的计价页；若服务商调整时段窗口，直接改档案——时段边界如今是设置项，不再是代码。
- **DeepSeek 节假日日历是 2026 年快照。** 内置 `holidays` 列表仅覆盖 2026 年，且没有任何机制自动刷新；每年春节过后列表就会过期，直到你（或插件更新）替换它。
- **星期门控按 UTC。** 星期与节假日日期都按 UTC 而非服务商本地时区判定。对两家内置时段而言这正是官方公布口径，但跨 UTC 午夜落入不同本地星期的窗口需要手工写明星期列表。
- **倒计时依据浏览器时钟。** 机器时钟严重不准时，显示的时段也会严重不准。
- **仅限 Web。** 浮标与设置面板都是浏览器界面；没有 Web app 的 profile 会加载插件但什么也看不到。

## 安全

安装插件意味着以你自己的权限运行第三方代码。本插件不写文件、不发起网络请求、不收集任何数据，唯一的持久痕迹是它自己的设置段。详见 [SECURITY.md](SECURITY.md)。

## 许可

[MIT](LICENSE) © 2026 Alex Shang。与 DeepSeek 无隶属关系。
