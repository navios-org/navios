import { circularDependency } from '../errors/create.mjs'

import { EntryStatus } from './entry.mjs'

import type { Entry } from './entry.mjs'

/** `entry` itself, or the stored entry that a transient was built for. */
function storedOwner(entry: Entry): Entry | null {
  let owner: Entry | null = entry
  while (owner !== null && owner.store === null) {
    owner = owner.creator
  }
  return owner
}

/**
 * Notes that `entry` injected the stored `dependency`. The stored owner of a
 * transient is linked in its place, so that invalidation reaches it.
 */
export function linkTo(dependency: Entry, entry: Entry): void {
  if (entry.store !== null) {
    link(entry, dependency)
    return
  }
  const owner = storedOwner(entry)
  if (owner !== null) {
    link(owner, dependency)
    // Kept to link the owner again when a later pass reuses the transient.
    ;(entry.deps ??= []).push(dependency)
  }
}

function link(owner: Entry, dependency: Entry): void {
  if (owner === dependency || owner.status > EntryStatus.Ready) {
    return
  }
  const dependents = (dependency.dependents ??= new Set())
  const known = dependents.size
  dependents.add(owner)
  if (dependents.size > known) {
    ;(owner.deps ??= []).push(dependency)
  }
}

/** Forgets what `entry` injected. */
export function unlink(entry: Entry): void {
  if (entry.deps !== null) {
    for (const dependency of entry.deps) {
      dependency.dependents?.delete(entry)
    }
    entry.deps = null
  }
}

// Whether nothing that a transient, or a transient of its own, injected has
// gone since. What it asked for with `asyncInject()` may still be in the
// making, or have failed: the promise it holds settles either way.
export function isIntact(transient: Entry): boolean {
  return (
    (transient.deps?.every((dependency) => dependency.status <= EntryStatus.Failed) ?? true) &&
    (transient.transients?.every(isIntact) ?? true)
  )
}

/** Links the owner of a reused transient to what the transient injected. */
export function relink(transient: Entry): void {
  const owner = storedOwner(transient)
  if (owner !== null) {
    transient.deps?.forEach((dependency) => link(owner, dependency))
    transient.transients?.forEach(relink)
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

/** Notes that `waiter` waits for `target`; throws when that closes a cycle. */
export function addWaitEdge(waiter: Entry, target: Entry): void {
  const back = waitPath(target, waiter, new Set())
  if (back !== null) {
    throw circularDependency([waiter, ...back].map((entry) => entry.token.toString()))
  }
  ;(waiter.waitingFor ??= new Set()).add(target)
}
