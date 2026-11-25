import { DIError } from '../errors/di-error.mjs'

import type { Entry } from './entry.mjs'
import type { Frame } from './resolution.mjs'

/** The nearest entry up the frame chain that lives in a store. */
export function storedOwner(frame: Frame | null): Entry | null {
  for (let f = frame; f !== null; f = f.parent) {
    if (f.entry.store !== null) {
      return f.entry
    }
  }
  return null
}

export function link(owner: Entry | null, dependency: Entry): void {
  if (owner === null || owner === dependency || dependency.store === null) {
    return
  }
  ;(owner.deps ??= []).push(dependency)
  ;(dependency.dependents ??= new Set()).add(owner)
}

export function unlink(entry: Entry): void {
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

export function addWaitEdge(waiter: Entry, target: Entry): void {
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
