/**
 * dsh-offpeak build: host ESM + client CJS bundle + declaration emit.
 *
 * The web server serves exactly one file per plugin
 * (`/plugins/dsh-offpeak/client.js`), so the client half is one CJS bundle
 * wrapped in the ModuleLoader factory handshake; `@deepseek-ai/dsh-*` and
 * `react` stay external (the profile's healed node_modules and the app's
 * module system provide them). The host half is plain ESM for Node,
 * externalizing `@deepseek-ai/dsh-*` plus cordis while bundling schemastery
 * (the Loader validates `Config` against the schema).
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

mkdirSync('lib', { recursive: true })

const dshExternal = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*']

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  jsx: 'automatic',
  external: [...dshExternal, 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler'],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-offpeak', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})

// Windows cannot spawn the pnpm shell shim through execFileSync; use the
// TypeScript compiler directly and let Node resolve the right binary.
execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { stdio: 'inherit' })
