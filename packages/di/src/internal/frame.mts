import type { InjectionToken, InjectionTokenType } from '../token/injection-token.mjs'

import type { Entry } from './entry.mjs'

/** A dependency that was not ready when a pass asked for it. */
export interface Pending {
  readonly promise: Promise<unknown>
  /** What was asked for: a token, or a factory token that has no value yet. */
  readonly token: InjectionTokenType
  readonly key: string | null
  readonly name: string
  failed: boolean
  error: unknown
}

/** One run of a class or a factory. */
export interface Pass {
  /** Set when its result is thrown away and it is repeated. */
  discarded: boolean
}

/** One construction in progress. */
export interface Frame {
  readonly entry: Entry
  readonly parent: Frame | null
  /**
   * The tokens the current pass asked for without args; `null` once the plan
   * is known.
   */
  requests: InjectionToken<any, any>[] | null
  /** Set when the current pass met a dependency that is not ready. */
  pending: Pending[] | null
  /** How much the last discarded pass was given. */
  given: number
  /** The current pass, for what outlives it; `null` until something does. */
  pass: Pass | null
  /** Transients built or reused in the current pass. */
  used: Entry[] | null
  /** Transients left over from a discarded pass, handed back on replay. */
  reuse: Entry[] | null
  /** Dependencies that failed while a discarded pass was waiting for them. */
  failures: Pending[] | null
  /**
   * Stop the pass at the first dependency that is not ready instead of
   * handing out a placeholder. Set while a factory runs: unlike a constructor
   * it goes on to use what it injected.
   */
  stopWhenPending: boolean
}

/**
 * Throws what `token` / `key` failed with while an earlier pass of `frame`
 * was waiting for it: waiting again would not change it.
 */
export function rethrowFailure(frame: Frame, token: InjectionTokenType, key: string | null): void {
  const known = frame.failures?.find((failure) => failure.token === token && failure.key === key)
  if (known !== undefined) {
    throw known.error
  }
}

/** The construction `inject()` belongs to. */
export let current: Frame | null = null

/**
 * The entry whose lifecycle hook or destroy listener is running its
 * synchronous part: what a resolution made there is made on behalf of.
 */
export let hookOwner: Entry | null = null

/** Makes `frame` the current one; returns the one to restore afterwards. */
export function enter(frame: Frame | null): Frame | null {
  const previous = current
  current = frame
  return previous
}

/**
 * Runs a lifecycle hook or a destroy listener of `owner`. It does not belong
 * to whatever construction happens to be in progress, so `inject()` is not
 * available in it.
 */
export function runHook<T>(owner: Entry, hook: () => T): T {
  const previousFrame = enter(null)
  const previousOwner = hookOwner
  hookOwner = owner
  try {
    return hook()
  } finally {
    hookOwner = previousOwner
    current = previousFrame
  }
}

/** Runs a callback that is part of no construction, whoever triggered it. */
export function outside<T>(callback: () => T): T {
  const previous = enter(null)
  try {
    return callback()
  } finally {
    current = previous
  }
}

/** The names of the services under construction, outermost first. */
export function framePath(): string[] {
  const path: string[] = []
  for (let frame = current; frame !== null; frame = frame.parent) {
    path.unshift(frame.entry.token.toString())
  }
  return path
}

export function onStack(entry: Entry): boolean {
  for (let frame = current; frame !== null; frame = frame.parent) {
    if (frame.entry === entry) {
      return true
    }
  }
  return false
}
