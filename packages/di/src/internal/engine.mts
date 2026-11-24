import { InjectableScope } from '../enums/index.mjs'
import { DIError } from '../errors/di-error.mjs'
import { validateSync } from '../schema/standard-schema.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'
import { findInjectableToken } from '../token/provider.mjs'

import type { IContainer } from '../interfaces/container.interface.mjs'
import type { AnyInjectableType, FactoryContext } from '../token/injection-token.mjs'
import type { PlanEntry, ProviderRecord } from '../token/provider.mjs'

import { argsKey } from './args-key.mjs'
import { createEntry, EntryStatus } from './entry.mjs'

import type { Entry, Store } from './entry.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type InstanceDecorator = (
  instance: any,
  info: { token: InjectionToken<any, any>; args: unknown },
) => unknown

interface FactoryValue {
  done: boolean
  value: unknown
  promise: Promise<void> | null
}

/**
 * What the engine needs from a container. Both `Container` and
 * `ScopedContainer` implement it.
 * @internal
 */
export interface Host {
  readonly root: RootHost
  readonly store: Store
  readonly isScope: boolean
  /** The public container, handed to factories. */
  readonly facade: IContainer
  /** Transients built by a top-level `get` on a scope that need destroying. */
  looseTransients: Entry[] | null
}

/** @internal */
export interface RootHost extends Host {
  readonly overrides: Map<InjectionToken<any, any>, ProviderRecord>
  /**
   * When `true`, only providers given to this container are used; the
   * defaults registered on tokens are ignored. Used by `UnitTestContainer`.
   */
  readonly strict: boolean
  decorators: Map<InjectionToken<any, any>, InstanceDecorator[]> | null
  readonly factoryValues: Map<FactoryInjectionToken<any, any>, FactoryValue>
}

/**
 * A resolution that cannot proceed until `promise` settles; the caller
 * retries afterwards.
 * @internal
 */
export class Wait {
  constructor(public readonly promise: Promise<unknown>) {}
}

interface Frame {
  readonly host: Host
  readonly entry: Entry
  readonly parent: Frame | null
  /** Requests made in the current pass; `null` once the plan is known. */
  requests: PlanEntry[] | null
  /** Set when the current pass met a dependency that is not ready. */
  pending: Promise<unknown>[] | null
  /** Transients built or reused in the current pass. */
  used: Entry[] | null
  /** Transients left over from a discarded pass, handed back on replay. */
  reuse: Entry[] | null
  /**
   * Stop the pass at the first dependency that is not ready instead of
   * handing out a placeholder. Set while a factory runs: unlike a constructor
   * it goes on to use what it injected.
   */
  stopWhenPending: boolean
}

/**
 * Thrown by `inject()` inside a factory to end a pass that is going to be
 * repeated. Only seen outside the engine by a factory that catches it.
 */
class DependencyNotReady extends Error {
  constructor(name: string) {
    super(`[Injector] ${name} is not ready yet; the factory runs again once it is`)
    this.name = 'DependencyNotReady'
  }
}

let current: Frame | null = null

const noop = () => {}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

// ----------------------------------------------------------------------------
// Token normalisation
// ----------------------------------------------------------------------------

// `normalize` reports its result through these to avoid an allocation per call.
let normToken: InjectionToken<any, any> = undefined as never
let normArgs: unknown = undefined

/**
 * Reduces any injectable reference to a plain token plus args. Returns a
 * promise when a factory token's value is not computed yet.
 */
function normalize(host: Host, raw: AnyInjectableType, rawArgs: unknown): Promise<unknown> | null {
  if (typeof raw === 'function') {
    const token = findInjectableToken(raw)
    if (token === undefined) {
      throw DIError.classNotInjectable(raw.name)
    }
    normToken = token
    normArgs = rawArgs
    return null
  }
  if (raw instanceof InjectionToken) {
    normToken = raw
    normArgs = rawArgs
    return null
  }
  if (raw instanceof BoundInjectionToken) {
    normToken = raw.token
    normArgs = raw.value
    return null
  }
  if (raw instanceof FactoryInjectionToken) {
    const state = factoryValue(host, raw)
    if (!state.done) {
      return state.promise!
    }
    normToken = raw.token
    normArgs = state.value
    return null
  }
  throw DIError.unknown(`[DI] ${String(raw)} is not an injectable class or token`)
}

function factoryValue(host: Host, token: FactoryInjectionToken<any, any>): FactoryValue {
  const values = host.root.factoryValues
  let state = values.get(token)
  if (state !== undefined) {
    return state
  }
  state = { done: false, value: undefined, promise: null }
  values.set(token, state)
  const created = state
  // The value is cached per root container, so it is computed against the
  // root: a scope's own values must not leak into it.
  const container = host.root.facade
  let result: unknown
  try {
    result = token.factory({
      inject: (t, a) => (container as any).get(t, a),
      container,
      addDestroyListener: noop,
    })
  } catch (error) {
    values.delete(token)
    throw error
  }
  if (isThenable(result)) {
    const promise = Promise.resolve(result).then(
      (value) => {
        created.value = value
        created.done = true
        created.promise = null
      },
      (error) => {
        values.delete(token)
        throw error
      },
    )
    promise.catch(noop)
    created.promise = promise
  } else {
    created.value = result
    created.done = true
  }
  return created
}

/**
 * The token behind any injectable reference, without resolving anything.
 * @internal
 */
export function baseToken(raw: AnyInjectableType): InjectionToken<any, any> | undefined {
  if (typeof raw === 'function') {
    return findInjectableToken(raw)
  }
  if (raw instanceof InjectionToken) {
    return raw
  }
  return (raw as BoundInjectionToken<any, any>).token
}

/** @internal */
export function lookupRecord(
  host: Host,
  token: InjectionToken<any, any>,
): ProviderRecord | undefined {
  const root = host.root
  return root.overrides.get(token) ?? (root.strict ? undefined : token.provider)
}

/** @internal */
export function hasProvider(host: Host, raw: AnyInjectableType): boolean {
  const token = baseToken(raw)
  if (token === undefined) {
    return false
  }
  return (
    (host.isScope && host.store.hasToken(token)) ||
    host.root.store.hasToken(token) ||
    lookupRecord(host, token) !== undefined
  )
}

// ----------------------------------------------------------------------------
// Resolution
// ----------------------------------------------------------------------------

function framePath(): string[] {
  const path: string[] = []
  for (let frame = current; frame !== null; frame = frame.parent) {
    path.unshift(frame.entry.token.toString())
  }
  return path
}

function onStack(entry: Entry): boolean {
  for (let frame = current; frame !== null; frame = frame.parent) {
    if (frame.entry === entry) {
      return true
    }
  }
  return false
}

function cyclePath(entry: Entry): string[] {
  const path = framePath()
  const name = entry.token.toString()
  const start = path.indexOf(name)
  return [...(start >= 0 ? path.slice(start) : path), name]
}

/**
 * Resolves a normalised token against `host`. Returns a ready entry, an entry
 * that is still being created (await `entry.promise`), or a `Wait`.
 *
 * Never awaits: everything that can be built synchronously is built before
 * this returns.
 */
function resolve(host: Host, token: InjectionToken<any, any>, rawArgs: unknown): Entry | Wait {
  let args = rawArgs
  if (token.schema !== undefined) {
    args = validateSync(token.schema, rawArgs, token.toString())
  }
  const key = args === undefined ? null : argsKey(args)

  for (;;) {
    let existing = host.isScope ? host.store.get(token, key) : undefined
    if (existing === undefined) {
      existing = host.root.store.get(token, key)
    }
    if (existing !== undefined) {
      switch (existing.status) {
        case EntryStatus.Ready:
          return existing
        case EntryStatus.Creating:
          if (onStack(existing)) {
            throw DIError.circularDependency(cyclePath(existing))
          }
          return existing
        case EntryStatus.Destroying:
          return new Wait(existing.destroyPromise ?? Promise.resolve())
        default:
          // A failed or destroyed entry that was not removed; drop it and retry.
          existing.store?.delete(existing)
          continue
      }
    }

    const record = lookupRecord(host, token)
    if (record === undefined) {
      if (token.scope === InjectableScope.Request && !host.isScope) {
        throw DIError.requestScopeFromRoot(token.toString(), framePath())
      }
      throw DIError.factoryNotFound(token.toString())
    }

    switch (record.scope) {
      case InjectableScope.Singleton:
        return build(host.root, host.root.store, record, token, key, args)
      case InjectableScope.Request:
        if (!host.isScope) {
          throw DIError.requestScopeFromRoot(token.toString(), framePath())
        }
        return build(host, host.store, record, token, key, args)
      default:
        return build(host, null, record, token, key, args)
    }
  }
}

function build(
  host: Host,
  store: Store | null,
  record: ProviderRecord,
  token: InjectionToken<any, any>,
  key: string | null,
  args: unknown,
): Entry {
  const entry = createEntry(record, token, key, args, store)
  if (record.kind === 'value') {
    entry.instance = record.value
    entry.status = EntryStatus.Ready
    store?.set(token, key, entry)
    store?.trackInstance(entry)
    return entry
  }
  store?.set(token, key, entry)

  const frame: Frame = {
    host,
    entry,
    parent: current,
    requests: null,
    pending: null,
    used: null,
    reuse: null,
    stopWhenPending: false,
  }

  let outcome: void | Promise<void>
  try {
    const waits =
      record.preResolve === true && record.plan !== null ? preResolve(frame, record.plan) : null
    if (waits === null && record.preResolve === true && record.plan !== null) {
      // Everything was ready this time; stop paying for the extra lookups
      // until a pass has to be discarded again.
      record.preResolve = false
    }
    outcome = waits === null ? pass(frame) : waits.then(() => replay(frame, true))
  } catch (error) {
    throw fail(entry, error)
  }
  if (outcome !== undefined) {
    const tracked = outcome.then(undefined, (error) => {
      throw fail(entry, error)
    })
    tracked.catch(noop)
    entry.promise = tracked
  }
  return entry
}

/**
 * Resolves the dependencies a class is known to ask for before constructing
 * it, so that a dependency with an asynchronous initialiser does not force a
 * discarded construction pass. Only used for classes that needed a replay
 * before.
 */
function preResolve(frame: Frame, plan: PlanEntry[]): Promise<unknown> | null {
  let waits: Promise<unknown>[] | null = null
  const previous = current
  current = frame
  try {
    for (const request of plan) {
      const record = lookupRecord(frame.host, request.token)
      if (record === undefined || record.scope === InjectableScope.Transient) {
        continue
      }
      let resolved: Entry | Wait
      try {
        resolved = resolve(frame.host, request.token, request.args)
      } catch {
        // The constructor may not ask for this one this time. If it does, it
        // gets the error itself.
        continue
      }
      if (resolved instanceof Wait) {
        ;(waits ??= []).push(resolved.promise)
      } else if (resolved.status !== EntryStatus.Ready) {
        addWaitEdge(frame.entry, resolved)
        ;(waits ??= []).push(resolved.promise!.then(noop, noop))
      }
    }
  } finally {
    current = previous
  }
  return waits === null ? null : Promise.all(waits)
}

function instantiate(frame: Frame): unknown {
  const { record, args } = frame.entry
  frame.stopWhenPending = false
  switch (record.kind) {
    case 'class':
      return args !== undefined ? new record.target!(args) : new record.target!()
    case 'factory': {
      const builder = new record.target!()
      if (frame.pending !== null) {
        return undefined
      }
      if (typeof builder.create !== 'function') {
        throw new Error('Factory does not implement the create method')
      }
      frame.stopWhenPending = true
      return builder.create(createFactoryContext(frame), args)
    }
    default:
      frame.stopWhenPending = true
      return record.fn!(createFactoryContext(frame), args)
  }
}

/**
 * Runs the class or factory of `frame` once. When the pass met a dependency
 * that is not ready (`frame.pending`), what it produced is worthless, and so
 * is the way a factory reacted to being stopped.
 */
function runOnce(frame: Frame): unknown {
  const previous = current
  current = frame
  let produced: unknown
  try {
    produced = instantiate(frame)
  } catch (error) {
    if (frame.pending === null || !(error instanceof DependencyNotReady)) {
      throw error
    }
  } finally {
    current = previous
  }
  if (frame.pending !== null && frame.entry.record.kind !== 'class' && isThenable(produced)) {
    // An asynchronous factory reports being stopped, or failing on a
    // placeholder, through a promise that nobody else observes.
    Promise.resolve(produced).then(noop, noop)
  }
  return produced
}

/**
 * One construction pass. Returns a promise when the entry cannot become ready
 * synchronously.
 */
function pass(frame: Frame): void | Promise<void> {
  const record = frame.entry.record
  frame.requests = record.plan === null ? [] : null
  frame.pending = null
  frame.used = null

  const produced = runOnce(frame)

  if (frame.pending !== null) {
    // The pass saw a dependency that is not ready. Whatever it produced was
    // built against placeholders and is discarded.
    record.preResolve = true
    return replay(frame, false)
  }
  return settle(frame, produced)
}

const MAX_PASSES = 32

async function replay(frame: Frame, planned: boolean): Promise<void> {
  const entry = frame.entry
  for (let attempt = 0; attempt < MAX_PASSES; attempt++) {
    if (!planned || attempt > 0) {
      await Promise.all(frame.pending!)
      frame.reuse = frame.used
    }
    entry.waitingFor = null

    const record = entry.record
    frame.requests = record.plan === null ? [] : null
    frame.pending = null
    frame.used = null

    const produced = runOnce(frame)

    if (frame.reuse !== null) {
      // Transients the discarded pass built that this pass did not ask for.
      for (const leftover of frame.reuse) {
        void destroyEntry(leftover)
      }
      frame.reuse = null
    }

    if (frame.pending === null) {
      const settled = settle(frame, produced)
      if (settled !== undefined) {
        await settled
      }
      return
    }
    record.preResolve = true
  }
  throw DIError.unknown(
    `[DI] ${entry.token.toString()} did not settle after ${MAX_PASSES} construction passes`,
  )
}

function settle(frame: Frame, produced: unknown): void | Promise<void> {
  const { entry, host } = frame
  const record = entry.record
  if (record.plan === null && frame.requests !== null) {
    record.plan = frame.requests
  }
  if (frame.used !== null) {
    entry.transients = entry.transients === null ? frame.used : entry.transients.concat(frame.used)
  }

  if (record.kind === 'class') {
    const instance = produced as { onServiceInit?: () => unknown }
    if (typeof instance.onServiceInit === 'function') {
      const initialised = instance.onServiceInit()
      if (isThenable(initialised)) {
        return Promise.resolve(initialised).then(() => complete(entry, instance, host))
      }
    }
    complete(entry, instance, host)
    return
  }

  if (isThenable(produced)) {
    return Promise.resolve(produced).then((value) => complete(entry, value, host))
  }
  complete(entry, produced, host)
}

function complete(entry: Entry, produced: unknown, host: Host): void {
  if (entry.status !== EntryStatus.Creating) {
    return
  }
  if (entry.record.kind === 'class') {
    const instance = produced as { onServiceDestroy?: () => void | Promise<void> }
    if (typeof instance.onServiceDestroy === 'function') {
      ;(entry.destroyListeners ??= []).push(() => instance.onServiceDestroy!())
    }
  }
  let value = produced
  const decorators = host.root.decorators?.get(entry.token)
  if (decorators !== undefined) {
    const info = { token: entry.token, args: entry.args }
    for (const decorate of decorators) {
      value = decorate(value, info)
    }
  }
  entry.instance = value
  entry.status = EntryStatus.Ready
  entry.promise = null
  entry.waitingFor = null
  entry.store?.trackInstance(entry)
}

function fail(entry: Entry, error: unknown): DIError {
  const wrapped =
    error instanceof DIError ? error : DIError.initializationError(entry.token.toString(), error)
  if (entry.status === EntryStatus.Creating) {
    entry.status = EntryStatus.Failed
    entry.error = wrapped
    entry.promise = null
    entry.waitingFor = null
    entry.store?.delete(entry)
    unlink(entry)
    if (entry.transients !== null) {
      for (const transient of entry.transients) {
        void destroyEntry(transient)
      }
      entry.transients = null
    }
  }
  return wrapped
}

// ----------------------------------------------------------------------------
// Dependency links and wait edges
// ----------------------------------------------------------------------------

/** The nearest entry up the frame chain that lives in a store. */
function storedOwner(frame: Frame | null): Entry | null {
  for (let f = frame; f !== null; f = f.parent) {
    if (f.entry.store !== null) {
      return f.entry
    }
  }
  return null
}

function link(owner: Entry | null, dependency: Entry): void {
  if (owner === null || owner === dependency || dependency.store === null) {
    return
  }
  ;(owner.deps ??= []).push(dependency)
  ;(dependency.dependents ??= new Set()).add(owner)
}

function unlink(entry: Entry): void {
  if (entry.deps !== null) {
    for (const dependency of entry.deps) {
      dependency.dependents?.delete(entry)
    }
    entry.deps = null
  }
}

/**
 * The chain of wait edges that leads from `from` to `to`, both included, or
 * `null` when `from` does not wait for `to`.
 */
function waitPath(from: Entry, to: Entry, seen: Set<Entry>): Entry[] | null {
  if (from === to) {
    return [from]
  }
  if (from.waitingFor === null || seen.has(from)) {
    return null
  }
  seen.add(from)
  for (const next of from.waitingFor) {
    const rest = waitPath(next, to, seen)
    if (rest !== null) {
      rest.unshift(from)
      return rest
    }
  }
  return null
}

function addWaitEdge(waiter: Entry, target: Entry): void {
  const back = waitPath(target, waiter, new Set())
  if (back !== null) {
    const cycle = [waiter.token.toString()]
    for (const entry of back) {
      cycle.push(entry.token.toString())
    }
    throw DIError.circularDependency(cycle)
  }
  ;(waiter.waitingFor ??= new Set()).add(target)
}

// ----------------------------------------------------------------------------
// Injectors
// ----------------------------------------------------------------------------

function placeholder(name: string): any {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          `[Injector] Trying to access ${name} before it's initialized, please move the code to a onServiceInit method`,
        )
      },
    },
  )
}

function requireFrame(what: string): Frame {
  if (current === null) {
    throw new Error(`[Injector] Trying to access ${what} outside of a injectable context`)
  }
  return current
}

/**
 * Notes that the pass needs something that is not ready and returns what
 * stands in for it.
 */
function suspend(frame: Frame, promise: Promise<unknown>, name: string): any {
  ;(frame.pending ??= []).push(promise)
  if (frame.stopWhenPending) {
    throw new DependencyNotReady(name)
  }
  return placeholder(name)
}

/** @internal */
export function injectImpl(raw: AnyInjectableType, rawArgs?: unknown): any {
  const frame = requireFrame('inject')
  const wait = normalize(frame.host, raw, rawArgs)
  if (wait !== null) {
    return suspend(frame, wait, String(raw))
  }
  const token = normToken
  const args = normArgs
  frame.requests?.push({ token, args })

  if (frame.reuse !== null) {
    const index = frame.reuse.findIndex((candidate) => candidate.token === token)
    if (index >= 0) {
      const [reused] = frame.reuse.splice(index, 1)
      if (reused.status === EntryStatus.Ready) {
        ;(frame.used ??= []).push(reused)
        return reused.instance
      }
    }
  }

  const resolved = resolve(frame.host, token, args)
  if (resolved instanceof Wait) {
    return suspend(frame, resolved.promise, token.toString())
  }
  if (resolved.store === null) {
    ;(frame.used ??= []).push(resolved)
  }
  if (resolved.status !== EntryStatus.Ready) {
    addWaitEdge(frame.entry, resolved)
    return suspend(frame, resolved.promise!, token.toString())
  }
  if (resolved.store !== null) {
    link(storedOwner(frame), resolved)
  }
  return resolved.instance
}

/** @internal */
export function optionalImpl(raw: AnyInjectableType, rawArgs?: unknown): any {
  const frame = requireFrame('optional')
  if (!hasProvider(frame.host, raw)) {
    return null
  }
  return injectImpl(raw, rawArgs)
}

/**
 * The promise `asyncInject()` hands out. It reports when somebody subscribes
 * to it, which is the only way to learn that the requester started to wait
 * for the dependency. Promises derived from it are plain promises.
 */
class InjectionPromise<T> extends Promise<T> {
  static override get [Symbol.species](): PromiseConstructor {
    return Promise
  }

  onSubscribe: (() => void) | null = null

  // A promise subclass has `then` anyway; this one only observes the call.
  // eslint-disable-next-line unicorn/no-thenable
  override then<A = T, B = never>(
    onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: any) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    this.onSubscribe?.()
    return super.then(onFulfilled, onRejected)
  }
}

/** @internal */
export function asyncInjectImpl(raw: AnyInjectableType, rawArgs?: unknown): Promise<any> {
  const frame = requireFrame('asyncInject')
  const host = frame.host
  const requester = frame.entry
  const owner = storedOwner(frame)

  // Asking for the dependency adds no wait edge, so it can be used to break a
  // cycle deliberately. Waiting for it does: once the requester subscribes to
  // the promise after its construction pass and before it is ready (in
  // `onServiceInit()`, or in an asynchronous factory), it cannot become ready
  // before the dependency. A dependency that waits for the requester in turn
  // then closes a cycle, which is reported instead of left hanging.
  let awaited = false
  let target: Entry | null = null
  let rejectCycle: (error: unknown) => void = noop

  const waitsForTarget = () => {
    if (
      !awaited ||
      target === null ||
      target.status !== EntryStatus.Creating ||
      requester.status !== EntryStatus.Creating
    ) {
      return
    }
    try {
      addWaitEdge(requester, target)
    } catch (error) {
      rejectCycle(error)
    }
  }
  const watch = (entry: Entry | null) => {
    if (entry === null) {
      if (target !== null) {
        requester.waitingFor?.delete(target)
        target = null
      }
      return
    }
    target = entry
    waitsForTarget()
  }

  // Starts after the current construction has returned.
  const work = Promise.resolve().then(() => {
    // Resolve synchronously first, so the dependency link exists one
    // microtask after the construction instead of whenever the dependency
    // finishes initialising.
    const first = resolveTop(host, raw, rawArgs)
    const linked =
      !(first instanceof Wait) &&
      first.store !== null &&
      owner !== null &&
      owner.status <= EntryStatus.Ready
    if (linked) {
      link(owner, first as Entry)
    }
    const ready =
      !(first instanceof Wait) && first.status === EntryStatus.Ready
        ? first
        : resolveAsync(host, raw, rawArgs, watch)
    return ready instanceof Promise
      ? ready.then((entry) => adopt(entry, linked ? (first as Entry) : null))
      : adopt(ready, linked ? ready : null)
  })

  const promise = new InjectionPromise<any>((resolve, reject) => {
    rejectCycle = reject
    work.then(resolve, reject)
  })
  promise.onSubscribe = () => {
    if (!awaited && current !== frame && requester.status === EntryStatus.Creating) {
      awaited = true
      waitsForTarget()
    }
  }
  return promise

  function adopt(entry: Entry, alreadyLinked: Entry | null): unknown {
    if (entry.store === null) {
      if (requester.status <= EntryStatus.Ready) {
        ;(requester.transients ??= []).push(entry)
      }
    } else if (entry !== alreadyLinked && owner !== null && owner.status <= EntryStatus.Ready) {
      link(owner, entry)
    }
    return entry.instance
  }
}

function createFactoryContext(frame: Frame): FactoryContext {
  const { host, entry } = frame
  return {
    inject: (token, args) => contextInject(host, entry, token, args),
    container: host.facade,
    addDestroyListener: (listener) => {
      ;(entry.destroyListeners ??= []).push(listener)
    },
  }
}

async function contextInject(
  host: Host,
  owner: Entry,
  raw: AnyInjectableType,
  rawArgs: unknown,
): Promise<any> {
  for (;;) {
    const resolved = resolveTop(host, raw, rawArgs)
    if (resolved instanceof Wait) {
      await resolved.promise
      continue
    }
    if (resolved.status === EntryStatus.Ready) {
      if (resolved.store === null) {
        ;(owner.transients ??= []).push(resolved)
      } else if (owner.store !== null) {
        link(owner, resolved)
      }
      return resolved.instance
    }
    if (resolved.status === EntryStatus.Creating) {
      addWaitEdge(owner, resolved)
      try {
        await resolved.promise
      } finally {
        owner.waitingFor?.delete(resolved)
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Entry points for containers
// ----------------------------------------------------------------------------

/**
 * Resolves from outside any construction (a `get` call), so the current
 * construction stack, if any, is not treated as the caller.
 * @internal
 */
export function resolveTop(host: Host, raw: AnyInjectableType, rawArgs: unknown): Entry | Wait {
  const previous = current
  current = null
  try {
    const wait = normalize(host, raw, rawArgs)
    if (wait !== null) {
      return new Wait(wait)
    }
    const resolved = resolve(host, normToken, normArgs)
    if (
      host.isScope &&
      !(resolved instanceof Wait) &&
      resolved.store === null &&
      resolved.status === EntryStatus.Ready &&
      (resolved.destroyListeners !== null || resolved.transients !== null)
    ) {
      ;(host.looseTransients ??= []).push(resolved)
    }
    return resolved
  } finally {
    current = previous
  }
}

/** @internal */
export async function resolveAsync(
  host: Host,
  raw: AnyInjectableType,
  rawArgs: unknown,
  /** Told which entry is being waited for, and `null` when the wait is over. */
  watch?: (waitingFor: Entry | null) => void,
): Promise<Entry> {
  for (;;) {
    const resolved = resolveTop(host, raw, rawArgs)
    if (resolved instanceof Wait) {
      await resolved.promise
      continue
    }
    if (resolved.status === EntryStatus.Ready) {
      return resolved
    }
    if (resolved.status === EntryStatus.Creating) {
      if (watch === undefined) {
        await resolved.promise
      } else {
        watch(resolved)
        try {
          await resolved.promise
        } finally {
          watch(null)
        }
      }
      if ((resolved.status as number) === EntryStatus.Ready) {
        if (
          host.isScope &&
          resolved.store === null &&
          (resolved.destroyListeners !== null || resolved.transients !== null)
        ) {
          ;(host.looseTransients ??= []).push(resolved)
        }
        return resolved
      }
    }
  }
}

/** @internal */
export function resolveSyncOrThrow(host: Host, raw: AnyInjectableType, rawArgs: unknown): Entry {
  const resolved = resolveTop(host, raw, rawArgs)
  if (resolved instanceof Wait || resolved.status !== EntryStatus.Ready) {
    if (!(resolved instanceof Wait)) {
      // Someone must observe the rejection if the pending work fails.
      resolved.promise?.catch(noop)
    }
    throw DIError.asyncInitRequired(baseToken(raw)?.toString() ?? String(raw))
  }
  return resolved
}

/**
 * Looks up a ready instance without constructing anything.
 * @internal
 */
export function peek(host: Host, raw: AnyInjectableType, rawArgs: unknown): Entry | undefined {
  let token: InjectionToken<any, any> | undefined
  let args = rawArgs
  if (raw instanceof BoundInjectionToken) {
    token = raw.token
    args = raw.value
  } else if (raw instanceof FactoryInjectionToken) {
    const state = host.root.factoryValues.get(raw)
    if (state === undefined || !state.done) {
      return undefined
    }
    token = raw.token
    args = state.value
  } else {
    token = baseToken(raw)
  }
  if (token === undefined) {
    return undefined
  }
  if (token.schema !== undefined) {
    try {
      args = validateSync(token.schema, args, token.toString())
    } catch {
      return undefined
    }
  }
  const key = args === undefined ? null : argsKey(args)
  const entry =
    (host.isScope ? host.store.get(token, key) : undefined) ?? host.root.store.get(token, key)
  return entry !== undefined && entry.status === EntryStatus.Ready ? entry : undefined
}

/**
 * Stores a ready value for a token in `host`.
 * @internal
 */
export function storeValue(
  host: Host,
  raw: ClassOrToken,
  value: unknown,
  scope: InjectableScope,
): void {
  let token: InjectionToken<any, any>
  let args: unknown
  if (typeof raw === 'function') {
    const found = findInjectableToken(raw)
    if (found === undefined) {
      throw DIError.classNotInjectable(raw.name)
    }
    token = found
  } else if (raw instanceof BoundInjectionToken) {
    token = raw.token
    args = raw.value
  } else {
    token = raw
    if (token.schema !== undefined) {
      const probe = token.schema['~standard'].validate(undefined)
      if (probe instanceof Promise || probe.issues) {
        if (probe instanceof Promise) {
          probe.catch(noop)
        }
        throw DIError.tokenSchemaRequiredError(token.name)
      }
    }
  }
  if (args !== undefined && token.schema !== undefined) {
    args = validateSync(token.schema, args, token.toString())
  }
  const key = args === undefined ? null : argsKey(args)
  const existing = host.store.get(token, key)
  if (existing !== undefined && existing.status <= EntryStatus.Ready) {
    throw DIError.unknown(
      `[DI] ${token.toString()} already has an instance in this container; invalidate it before adding another`,
    )
  }
  const entry = createEntry(
    { token, kind: 'value', target: undefined, fn: undefined, value, scope, plan: null },
    token,
    key,
    args,
    host.store,
  )
  entry.instance = value
  entry.status = EntryStatus.Ready
  const hooks = value as { onServiceDestroy?: () => void | Promise<void> } | null
  if (hooks !== null && typeof hooks === 'object' && typeof hooks.onServiceDestroy === 'function') {
    entry.destroyListeners = [() => hooks.onServiceDestroy!()]
  }
  host.store.set(token, key, entry)
  host.store.trackInstance(entry)
}

type ClassOrToken =
  | (new (...args: any[]) => any)
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>

// ----------------------------------------------------------------------------
// Destruction
// ----------------------------------------------------------------------------

/**
 * Destroys an entry: its dependents first, then its own destroy listeners,
 * then the transients it owns. Synchronous when nothing involved is async.
 * @internal
 */
export function destroyEntry(entry: Entry): void | Promise<void> {
  switch (entry.status) {
    case EntryStatus.Ready:
      break
    case EntryStatus.Destroying:
      return entry.destroyPromise ?? undefined
    case EntryStatus.Creating: {
      const pending = (entry.promise ?? Promise.resolve()).then(noop, noop)
      return pending.then(() => destroyEntry(entry))
    }
    default:
      return
  }

  entry.status = EntryStatus.Destroying
  let waits: Promise<void>[] | null = null
  if (entry.dependents !== null && entry.dependents.size > 0) {
    for (const dependent of Array.from(entry.dependents)) {
      const result = destroyEntry(dependent)
      if (result !== undefined) {
        ;(waits ??= []).push(result)
      }
    }
  }

  const result = waits === null ? teardown(entry) : Promise.all(waits).then(() => teardown(entry))
  if (result !== undefined) {
    const settled = result.then(noop, noop)
    entry.destroyPromise = settled
    return settled
  }
}

function teardown(entry: Entry): void | Promise<void> {
  let waits: Promise<unknown>[] | null = null
  if (entry.destroyListeners !== null) {
    for (let i = entry.destroyListeners.length - 1; i >= 0; i--) {
      try {
        const result = entry.destroyListeners[i]()
        if (isThenable(result)) {
          ;(waits ??= []).push(Promise.resolve(result).then(noop, noop))
        }
      } catch {
        // A failing destroy hook must not stop the rest of the teardown.
      }
    }
  }
  if (entry.transients !== null) {
    for (const transient of entry.transients) {
      const result = destroyEntry(transient)
      if (result !== undefined) {
        ;(waits ??= []).push(result)
      }
    }
  }
  if (waits !== null) {
    return Promise.all(waits).then(() => finalize(entry))
  }
  finalize(entry)
}

function finalize(entry: Entry): void {
  entry.status = EntryStatus.Destroyed
  entry.store?.delete(entry)
  unlink(entry)
  entry.dependents = null
  entry.transients = null
  entry.destroyListeners = null
  entry.destroyPromise = null
  entry.store?.notifyInvalidated(entry)
}

/**
 * Destroys every entry of a store in reverse creation order.
 * @internal
 */
export function destroyAll(entries: Entry[]): void | Promise<void> {
  if (entries.length === 0) {
    return
  }
  if (entries.length > 1) {
    entries.sort((a, b) => b.seq - a.seq)
  }
  for (let i = 0; i < entries.length; i++) {
    const result = destroyEntry(entries[i])
    if (result !== undefined) {
      return result.then(() => destroyAll(entries.slice(i + 1)))
    }
  }
}

/**
 * Waits until no entry of the store is still being created.
 * @internal
 */
export async function settleStore(store: Store): Promise<void> {
  for (;;) {
    const creating = store
      .entries()
      .filter((entry) => entry.status === EntryStatus.Creating && entry.promise !== null)
    if (creating.length === 0) {
      return
    }
    await Promise.all(creating.map((entry) => entry.promise!.then(noop, noop)))
  }
}
