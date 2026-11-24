import type { Container, ScopedContainer } from '@navios/di'

/**
 * Book-keeping for scopes a `ScopeProvider` creates while rendering.
 *
 * A provider creates its scope during render, because its children resolve
 * from it in the same render. React can throw that render away without ever
 * committing it: a child suspends under a `<Suspense>` boundary outside the
 * provider, a sibling suspends, an update interrupts the render. Nothing the
 * provider holds (refs, state) survives, and no effect or cleanup runs.
 *
 * So every scope starts here as *pending*, held by its parent container, the
 * one object that is the same in every attempt:
 *
 * - a provider that commits takes its scope out (`commitScope`);
 * - a provider that mounts again after a child suspended picks the pending
 *   scope up instead of creating another one (`acquireScope`), so the child
 *   finds the instance it was waiting for;
 * - pending scopes nobody commits are disposed by later commits
 *   (`sweepPendingScopes`) or when the last `ContainerProvider` of the
 *   container unmounts (`retainContainer`).
 */

type Metadata = Record<string, unknown> | undefined

interface ScopeRecord {
  readonly scope: ScopedContainer
  readonly parent: Container
  /** The `scopeId` prop; undefined when the id was generated. */
  readonly scopeId: string | undefined
  readonly metadata: Metadata
  state: 'pending' | 'committed' | 'disposed'
  /** The provider instance that committed the scope. */
  owner: object | null
  /** A child suspended in this scope before any provider committed it. */
  suspended: boolean
  /** Suspense promises of this scope that have not settled yet. */
  loading: number
  /** The slice in which a render last took this scope. */
  slice: object
  /** The props object of the provider that last took this scope. */
  props: object | null
  /** A sweep has already seen the scope idle; the next one disposes it. */
  passedOver: boolean
}

interface Pool {
  readonly pending: Set<ScopeRecord>
  /** Mounted `ContainerProvider`s of the container. */
  providers: number
  sweptIn: object | null
}

/**
 * Without a DOM there is no commit to wait for: a server render never runs
 * effects, so a pending scope would stay in the pool for good. Scopes are not
 * tracked there, and nothing holds them once the render is over.
 */
const isServer = typeof window === 'undefined'

const records = new WeakMap<ScopedContainer, ScopeRecord>()
const pools = new WeakMap<Container, Pool>()

function getPool(parent: Container): Pool {
  let pool = pools.get(parent)
  if (!pool) {
    pool = { pending: new Set(), providers: 0, sweptIn: null }
    pools.set(parent, pool)
  }
  return pool
}

// A slice is one synchronous stretch of work: it ends with the next microtask.
// With React's scheduler every attempt at a suspended tree runs in a slice of
// its own, so two providers that ask for a scope in the same slice are two
// live providers of one render and must not share a scope.
let slice: object | null = null

function currentSlice(): object {
  if (slice === null) {
    slice = {}
    queueMicrotask(() => {
      slice = null
    })
  }
  return slice
}

function isPlain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Plain objects and arrays compare by content, everything else by identity. */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameData(item, b[index]))
  }
  if (isPlain(a) && isPlain(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameData(a[key], b[key]))
    )
  }
  return false
}

function track(
  parent: Container,
  scopeId: string | undefined,
  metadata: Metadata,
  generatedId: string,
  props: object | null,
): ScopeRecord {
  // DI scopes have no ids, so the effective scope id lives in the scope's
  // metadata under `scopeId`.
  const scope = parent.createScope({ ...metadata, scopeId: scopeId ?? generatedId })
  const record: ScopeRecord = {
    scope,
    parent,
    scopeId,
    metadata,
    state: 'pending',
    owner: null,
    suspended: false,
    loading: 0,
    slice: currentSlice(),
    props,
    passedOver: false,
  }
  records.set(scope, record)
  return record
}

function disposeRecord(record: ScopeRecord): void {
  if (record.state === 'disposed') {
    return
  }
  record.state = 'disposed'
  record.props = null
  pools.get(record.parent)?.pending.delete(record)
  // Disposal is fire-and-forget, as on unmount; a failing destroy hook must
  // not surface as an unhandled rejection of a render or an effect.
  record.scope.dispose().catch(() => {})
}

/**
 * The scope for a provider that renders for the first time.
 *
 * Returns a pending scope in which a child suspended, when one was created
 * for the same `scopeId` and metadata and the provider that held it is gone.
 * Otherwise creates a new pending scope.
 *
 * React does not say whether the earlier provider is gone, so this goes by
 * what it can see. The earlier provider is taken to be gone when it rendered
 * in an earlier slice, or when it had the very same props object: React hands
 * the same element to every attempt at one position, as long as the component
 * that created the element is not rendered again itself.
 */
export function acquireScope(
  parent: Container,
  props: { scopeId?: string; metadata?: Metadata },
  generatedId: string,
): ScopedContainer {
  const { scopeId, metadata } = props
  if (isServer) {
    return parent.createScope({ ...metadata, scopeId: scopeId ?? generatedId })
  }
  const pool = getPool(parent)
  const now = currentSlice()
  for (const record of pool.pending) {
    if (
      record.suspended &&
      (record.slice !== now || record.props === props) &&
      record.scopeId === scopeId &&
      sameData(record.metadata, metadata)
    ) {
      record.slice = now
      record.props = props
      record.passedOver = false
      return record.scope
    }
  }
  const record = track(parent, scopeId, metadata, generatedId, props)
  pool.pending.add(record)
  return record.scope
}

/** A scope for a provider that is already committed. */
export function createCommittedScope(
  parent: Container,
  scopeId: string | undefined,
  metadata: Metadata,
  generatedId: string,
  owner: object,
): ScopedContainer {
  const record = track(parent, scopeId, metadata, generatedId, null)
  record.state = 'committed'
  record.owner = owner
  return record.scope
}

/**
 * Hands a pending scope to the provider that committed with it.
 *
 * - `committed`: the scope belongs to `owner` now.
 * - `taken`: another provider committed with the same scope first.
 * - `disposed`: the scope was disposed before the commit.
 */
export function commitScope(
  scope: ScopedContainer,
  owner: object,
): 'committed' | 'taken' | 'disposed' {
  const record = records.get(scope)
  if (!record) {
    // Not tracked (see `isServer`): the scope was never shared.
    return 'committed'
  }
  if (record.state === 'disposed') {
    return 'disposed'
  }
  if (record.state === 'committed') {
    return record.owner === owner ? 'committed' : 'taken'
  }
  record.state = 'committed'
  record.owner = owner
  record.props = null
  pools.get(record.parent)?.pending.delete(record)
  return 'committed'
}

/** Whether the scope was disposed through this module. */
export function isScopeDisposed(scope: ScopedContainer): boolean {
  return records.get(scope)?.state === 'disposed'
}

/** Disposes a scope, pending or committed. */
export function disposeScope(scope: ScopedContainer): void {
  const record = records.get(scope)
  if (record) {
    disposeRecord(record)
  } else {
    scope.dispose().catch(() => {})
  }
}

/**
 * Disposes the pending scopes of `parent` that nobody is going to commit.
 *
 * Called from the passive effects of a provider, that is after every provider
 * of the same commit has taken its scope. A pending scope left at that point
 * belongs to a render React threw away, or to one that is still on its way.
 * To spare the second kind, a scope is disposed only when two sweeps in a row
 * find it idle: not taken by a render in between, and not loading a service a
 * suspended child waits for.
 */
export function sweepPendingScopes(parent: Container): void {
  const pool = pools.get(parent)
  if (!pool || pool.pending.size === 0) {
    return
  }
  const now = currentSlice()
  if (pool.sweptIn === now) {
    return
  }
  pool.sweptIn = now
  for (const record of pool.pending) {
    if (record.loading > 0 || record.slice === now) {
      continue
    }
    if (record.passedOver) {
      disposeRecord(record)
    } else {
      record.passedOver = true
    }
  }
}

/**
 * Records that a child is about to suspend on `promise` in `container`.
 * Marks a pending scope as worth picking up by the next attempt, and keeps it
 * out of sweeps until the promise settles.
 */
export function trackSuspense(container: object, promise: Promise<unknown>): void {
  const record = records.get(container as ScopedContainer)
  if (!record || record.state !== 'pending') {
    return
  }
  record.suspended = true
  record.loading++
  const settled = () => {
    record.loading--
  }
  promise.then(settled, settled)
}

/**
 * Counts a mounted `ContainerProvider`. When the last one of a container
 * unmounts, no provider below it can commit any more, so every pending scope
 * of the container is disposed.
 */
export function retainContainer(parent: Container): () => void {
  const pool = getPool(parent)
  pool.providers++
  return () => {
    pool.providers--
    // One microtask later, like the scope disposal of `ScopeProvider`: the
    // unmount StrictMode simulates is followed by a re-mount at once.
    queueMicrotask(() => {
      if (pool.providers > 0) {
        return
      }
      for (const record of pool.pending) {
        disposeRecord(record)
      }
    })
  }
}
