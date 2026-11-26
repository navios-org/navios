import { circularDependency } from '../errors/create.mjs'

import { EntryStatus, isLeaving } from './entry.mjs'

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
    addDep(entry, dependency)
  }
}

function link(owner: Entry, dependency: Entry): void {
  if (owner === dependency || owner.status > EntryStatus.Ready) {
    return
  }
  if (owner.host !== dependency.host) {
    linkAcross(owner, dependency)
    return
  }
  const dependents = (dependency.dependents ??= new Set())
  const known = dependents.size
  dependents.add(owner)
  if (dependents.size > known) {
    addDep(owner, dependency)
  }
}

/**
 * A link from an entry of a scope to an entry of the root container that it
 * injected.
 */
export interface ScopedLink {
  readonly owner: Entry
  readonly dependency: Entry
  previous: ScopedLink | null
  next: ScopedLink | null
  /** The next link of the same owner. */
  readonly nextOfOwner: ScopedLink | null
}

// An entry of the root container, such as a singleton, gains and loses a
// dependent in every request whose scoped services inject it. In a set that
// lives as long as the container does, that churn has V8 allocate its new
// tables in the old generation, which brings on full garbage collections. A
// list through the links allocates one small object per link, which dies
// young, and removes it in constant time.
function linkAcross(owner: Entry, dependency: Entry): void {
  for (let known = owner.rootLinks; known !== null; known = known.nextOfOwner) {
    if (known.dependency === dependency) {
      return
    }
  }
  const head = dependency.scopedDependents
  const added: ScopedLink = {
    owner,
    dependency,
    previous: null,
    next: head,
    nextOfOwner: owner.rootLinks,
  }
  if (head !== null) {
    head.previous = added
  }
  dependency.scopedDependents = added
  owner.rootLinks = added
  addDep(owner, dependency)
}

function detach(link: ScopedLink): void {
  const { previous, next, dependency } = link
  if (previous !== null) {
    previous.next = next
  } else if (dependency.scopedDependents === link) {
    dependency.scopedDependents = next
  } else {
    // The dependency is gone and has dropped its list.
    return
  }
  if (next !== null) {
    next.previous = previous
  }
  link.previous = null
  link.next = null
}

/**
 * The entries that injected `entry`, in its own container and in scopes, in
 * the order they did.
 */
export function dependentsOf(entry: Entry): Entry[] {
  const local = entry.dependents === null ? [] : Array.from(entry.dependents)
  if (entry.scopedDependents === null) {
    return local
  }
  // The set and the list each keep the order of linking, the list newest
  // first. An entry links what it injects while it is built, right after it
  // was created, so the creation order of the owners interleaves the two.
  const scoped: Entry[] = []
  for (let link: ScopedLink | null = entry.scopedDependents; link !== null; link = link.next) {
    scoped.push(link.owner)
  }
  const all: Entry[] = []
  let i = 0
  let j = scoped.length - 1
  while (i < local.length && j >= 0) {
    all.push(local[i].seq < scoped[j].seq ? local[i++] : scoped[j--])
  }
  while (i < local.length) {
    all.push(local[i++])
  }
  while (j >= 0) {
    all.push(scoped[j--])
  }
  return all
}

// Most entries inject a few others. An array that starts empty gets room for
// seventeen at the first push.
function addDep(entry: Entry, dependency: Entry): void {
  if (entry.deps === null) {
    entry.deps = [dependency]
  } else {
    entry.deps.push(dependency)
  }
}

/** Forgets what `entry` injected. */
export function unlink(entry: Entry): void {
  if (entry.deps !== null) {
    for (const dependency of entry.deps) {
      // One that is being destroyed forgets all of its dependents when it is
      // gone, and shrinking its set first would only cost an allocation. One
      // in the root container keeps a scope's entries in a list instead.
      if (dependency.host === entry.host && !isLeaving(dependency)) {
        dependency.dependents?.delete(entry)
      }
    }
    entry.deps = null
  }
  for (let link = entry.rootLinks; link !== null; link = link.nextOfOwner) {
    detach(link)
  }
  entry.rootLinks = null
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
