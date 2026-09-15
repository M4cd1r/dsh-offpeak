/**
 * Client store engine resolution.
 *
 * The browser half runs inside the harness's client module system, where a
 * bundle may only `require()` ids the module table publishes. That table is
 * version-dependent: current DSH publishes the store engine as the virtual id
 * `@deepseek-ai/dsh-client-store`, while older releases published it as the
 * subpath `@deepseek-ai/dsh-client-runtime/client`.
 *
 * The ids are built at runtime (never as literal `import` specifiers) so the
 * bundler leaves both lookups as plain `require()` calls the module system can
 * answer, and the same bundle loads on either release.
 */
declare const require: ((id: string) => unknown) | undefined

/**
 * The engine's own published store contract (`ObservableSnapshot` + writes).
 * It is the face the slots' `inject` accepts, so the wrapper must expose it —
 * `getSnapshot` in particular, which the selector hooks read.
 */
type EngineSnapshotStore<T> = import('@deepseek-ai/dsh-client-runtime/client').SnapshotStore<T>

/** The engine face this plugin uses. */
export interface ClientStoreEngine {
  createSnapshotStore: <T>(value: T, options?: unknown) => EngineSnapshotStore<T> & { get(): T }
}

/** Virtual id published by current DSH releases. */
const VIRTUAL_STORE_ID = ['@deepseek-ai/dsh-client', '-store'].join('')

/** Subpath published by older DSH releases. */
const LEGACY_STORE_ID = ['@deepseek-ai/dsh-client-runtime', '/client'].join('')

/** Resolve the engine from whichever id the running harness publishes. */
function loadEngine(): ClientStoreEngine {
  const loader = typeof require === 'function' ? require : undefined
  if (loader === undefined) {
    throw new Error('dsh-offpeak: the client module system exposed no require() seam')
  }
  try {
    return loader(VIRTUAL_STORE_ID) as ClientStoreEngine
  } catch {
    return loader(LEGACY_STORE_ID) as ClientStoreEngine
  }
}

/** The resolved store engine (throws at load when neither id is published). */
export const storeEngine: ClientStoreEngine = loadEngine()

/** The shared snapshot-store factory. */
export const createSnapshotStore = storeEngine.createSnapshotStore
