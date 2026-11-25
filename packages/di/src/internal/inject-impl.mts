import type { FactoryContext } from '../provider/factory-context.mjs'
import type { AnyInjectableType } from '../token/injection-token.mjs'

import { EntryStatus } from './entry.mjs'
import { addWaitEdge, link, storedOwner } from './links.mjs'
import { hasProvider, normalize, normArgs, normToken } from './normalize.mjs'
import {
  current,
  DependencyNotReady,
  resolve,
  resolveAsync,
  resolveTop,
  Wait,
} from './resolution.mjs'
import { noop } from './thenable.mjs'

import type { Entry } from './entry.mjs'
import type { Host } from './host.mjs'
import type { Frame } from './resolution.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

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

export function createFactoryContext(frame: Frame): FactoryContext {
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
