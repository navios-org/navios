import { accessBeforeInit, misuse, outsideInjectionContext } from '../errors/create.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { validateSync } from '../schema/standard-schema.mjs'
import { FactoryInjectionToken } from '../token/injection-token.mjs'

import type { FactoryContext } from '../provider/factory-context.mjs'
import type {
  AnyInjectableType,
  InjectionToken,
  InjectionTokenType,
} from '../token/injection-token.mjs'

import { argsKey } from './args-key.mjs'
import { inBackground } from './background.mjs'
import { discard, runDestroyListener } from './destruction.mjs'
import { EntryStatus, isLeaving } from './entry.mjs'
import { current, runHook } from './frame.mjs'
import { addWaitEdge, isIntact, linkTo, relink } from './links.mjs'
import {
  finalToken,
  followAlias,
  hasInstance,
  hasProvider,
  lookupRecord,
  normalize,
  normArgs,
  normToken,
} from './normalize.mjs'
import {
  assertInTime,
  assertSettles,
  DependencyNotReady,
  keepLoose,
  resolve,
  resolveAsync,
  resolveTop,
  Wait,
} from './resolution.mjs'
import { noop } from './thenable.mjs'

import type { Entry } from './entry.mjs'
import type { Frame, Pending } from './frame.mjs'
import type { Host } from './host.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

function placeholder(name: string): any {
  const refuse = () => {
    throw accessBeforeInit(name)
  }
  return new Proxy(
    {},
    {
      get: refuse,
      set: refuse,
      has: refuse,
      ownKeys: refuse,
      getOwnPropertyDescriptor: refuse,
      defineProperty: refuse,
      deleteProperty: refuse,
    },
  )
}

function requireFrame(what: string): Frame {
  if (current === null) {
    throw outsideInjectionContext(what)
  }
  return current
}

// Notes that the pass needs something that is not ready and returns what
// stands in for it.
function suspend(
  frame: Frame,
  promise: Promise<unknown>,
  token: InjectionTokenType,
  key: string | null,
): any {
  const name = String(token)
  const pending: Pending = { promise, token, key, name, failed: false, error: null }
  promise.then(undefined, (error) => {
    pending.failed = true
    pending.error = error
  })
  ;(frame.pending ??= []).push(pending)
  if (frame.stopWhenPending) {
    throw new DependencyNotReady(name)
  }
  return placeholder(name)
}

// Throws what `token` failed with while an earlier pass was waiting for it.
function rethrowFailure(frame: Frame, token: InjectionTokenType, key: string | null): void {
  const known = frame.failures?.find((failure) => failure.token === token && failure.key === key)
  if (known !== undefined) {
    throw known.error
  }
}

// What an earlier pass already came to for this request: a transient it
// built, which is handed back, or the error of a dependency that failed.
// Both are known by what an alias points to, unless it has an instance itself.
function fromEarlierPass(
  frame: Frame,
  asked: InjectionToken<any, any>,
  rawArgs: unknown,
): Entry | null {
  const { host } = frame.entry
  const followed = !hasInstance(host, asked)
  const target = followed ? followAlias(host, asked) : asked
  if (target instanceof FactoryInjectionToken) {
    rethrowFailure(frame, target, null)
  }
  if (normalize(host, target, rawArgs) !== null) {
    return null
  }
  let args = normArgs
  const token = followed ? finalToken(host, normToken)! : asked
  if (token.schema !== undefined) {
    args = validateSync(token.schema, args, token.toString())
  }
  const key = args === undefined ? null : argsKey(args)
  rethrowFailure(frame, token, key)
  const index =
    frame.reuse?.findIndex((candidate) => candidate.token === token && candidate.key === key) ?? -1
  if (index < 0) {
    return null
  }
  const [reused] = frame.reuse!.splice(index, 1)
  if (reused.status === EntryStatus.Ready && isIntact(reused)) {
    relink(reused)
    return reused
  }
  discard(reused)
  return null
}

export function injectImpl(raw: AnyInjectableType, rawArgs?: unknown): any {
  const frame = requireFrame('inject')
  if (frame.failures !== null && raw instanceof FactoryInjectionToken) {
    rethrowFailure(frame, raw, null)
  }
  const value = normalize(frame.entry.host, raw, rawArgs)
  if (value !== null) {
    addWaitEdge(frame.entry, value)
    return suspend(frame, value.promise!, raw as FactoryInjectionToken<any, any>, null)
  }
  const token = normToken
  const args = normArgs
  if (args === undefined) {
    // A request with args is never planned: the args are those of this build.
    frame.requests?.push(token)
  }

  if (frame.reuse !== null || frame.failures !== null) {
    const reused = fromEarlierPass(frame, token, args)
    if (reused !== null) {
      ;(frame.used ??= []).push(reused)
      return reused.instance
    }
  }

  const resolved = resolve(frame.entry.host, token, args)
  if (resolved instanceof Wait) {
    if (resolved.until !== null) {
      addWaitEdge(frame.entry, resolved.until)
    }
    return suspend(frame, resolved.promise, resolved.factory ?? token, null)
  }
  if (resolved.store === null) {
    ;(frame.used ??= []).push(resolved)
  }
  if (resolved.status !== EntryStatus.Ready) {
    addWaitEdge(frame.entry, resolved)
    // No promise yet: its `onServiceInit()` is what started this resolution.
    return suspend(frame, resolved.promise ?? Promise.resolve(), resolved.token, resolved.key)
  }
  if (resolved.store !== null) {
    linkTo(resolved, frame.entry)
  }
  return resolved.instance
}

export function optionalImpl(raw: AnyInjectableType, rawArgs?: unknown): any {
  const frame = requireFrame('optional')
  if (!hasProvider(frame.entry.host, raw)) {
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

export function asyncInjectImpl(raw: AnyInjectableType, rawArgs?: unknown): Promise<any> {
  const frame = requireFrame('asyncInject')
  const host = frame.entry.host
  const requester = frame.entry
  const pass = (frame.pass ??= { discarded: false })

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
    if ((pass.discarded || requester.status === EntryStatus.Failed) && isTransient(host, raw)) {
      // It would be built for nobody: the next pass, if there is one, asks for
      // a transient of its own. What is stored is the same for both. Nothing
      // waits for this promise but what goes with the pass.
      return new Promise<never>(noop)
    }
    // Resolve synchronously first, so the dependency link exists one
    // microtask after the construction instead of whenever the dependency
    // finishes initialising.
    const first = resolveTop(host, raw, rawArgs, requester)
    if (!(first instanceof Wait)) {
      if (first.store !== null && !pass.discarded) {
        linkTo(first, requester)
      }
      if (first.status !== EntryStatus.Creating) {
        return adopt(first)
      }
    }
    return resolveAsync(host, raw, rawArgs, requester, first, watch).then(adopt)
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
  // A caller that awaits the promise receives the error; one that never gets
  // to it, because its scope ended or its constructor pass was discarded, must
  // not end up with an unhandled rejection. When it has settled there is
  // nothing to subscribe to any more, and what the subscription refers to, such
  // as the request the requester was built in, can go.
  const settled = () => {
    promise.onSubscribe = null
  }
  Promise.prototype.then.call(promise, settled, settled)
  return promise

  function adopt(entry: Entry): unknown {
    if (entry.store !== null) {
      if (!pass.discarded) {
        linkTo(entry, requester)
      }
    } else if (requester.status <= EntryStatus.Ready || requester.status === EntryStatus.Leaving) {
      const isFirst = requester.transients === null && requester.destroyListeners === null
      ;(requester.transients ??= []).push(entry)
      if (isFirst && requester.creator === null) {
        // Handed out before there was anything to destroy.
        keepLoose(host, requester)
      }
    } else {
      // Its owner is gone, and nobody else knows of it.
      discard(entry)
    }
    return entry.instance
  }
}

function isTransient(host: Host, raw: AnyInjectableType): boolean {
  const token = finalToken(host, raw)
  return token !== undefined && lookupRecord(host, token)?.scope === InjectableScope.Transient
}

export function createFactoryContext(entry: Entry): FactoryContext {
  const { host } = entry
  return {
    inject: (token: any, args?: unknown) => contextInject(entry, token, args),
    container: host.facade,
    addDestroyListener: (listener) => {
      if (entry.status <= EntryStatus.Ready || entry.status === EntryStatus.Leaving) {
        ;(entry.destroyListeners ??= []).push(listener)
        return
      }
      // The teardown is past the listeners, so what this one releases would
      // stay behind.
      const released = runDestroyListener(entry, listener)
      if (released !== undefined) {
        inBackground(host, released)
      }
    },
  }
}

async function contextInject(owner: Entry, raw: AnyInjectableType, rawArgs: unknown): Promise<any> {
  const { host } = owner
  for (let restarts = 0; ; assertSettles(raw, ++restarts)) {
    const building = owner.status === EntryStatus.Creating
    const by = building ? owner : null
    const resolved = isLeaving(owner)
      ? runHook(owner, () => resolveTop(host, raw, rawArgs, by))
      : resolveTop(host, raw, rawArgs, by)
    if (resolved instanceof Wait) {
      if (resolved.leaving !== null && isLeaving(owner)) {
        throw misuse(
          `${resolved.leaving.token} is being destroyed, and ${owner.token} cannot wait for that ` +
            `while it is being destroyed itself`,
        )
      }
      await resolved.promise
      continue
    }
    const inTime = resolved.status !== EntryStatus.Creating
    if (!inTime) {
      addWaitEdge(owner, resolved)
      try {
        await resolved.promise
      } finally {
        owner.waitingFor?.delete(resolved)
      }
      if ((resolved.status as number) !== EntryStatus.Ready) {
        continue
      }
      assertInTime(resolved)
    }
    if (resolved.store !== null) {
      linkTo(resolved, owner)
    } else if (owner.status === EntryStatus.Creating) {
      ;(owner.transients ??= []).push(resolved)
    } else if (owner.status === EntryStatus.Failed) {
      discard(resolved)
    } else {
      // Once the owner is built, `inject` may be called any number of times,
      // so the owner does not keep what it hands out. A scope does, as for a
      // `get`.
      keepLoose(host, resolved)
    }
    return resolved.instance
  }
}
