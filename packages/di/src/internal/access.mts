import type { Container } from '../container/container.mjs'
import type { Provider } from '../provider/provide.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import { EntryStatus } from './entry.mjs'
import { baseToken, isResolved } from './lookup.mjs'

import type { Entry } from './entry.mjs'
import type { ErrorReporter } from './host.mjs'

function isShared(instance: unknown): boolean {
  return (typeof instance === 'object' && instance !== null) || typeof instance === 'function'
}

/** The ready entries of a container, dependencies before dependents. */
export function readyEntries(container: Container): Entry[] {
  return container.store
    .entries()
    .filter((entry) => entry.status === EntryStatus.Ready && entry.instance !== container)
    .sort((left, right) => left.readySeq - right.readySeq)
}

/** The instances of `entries`, each object once. */
export function instancesOf(entries: Entry[]): unknown[] {
  const seen = new Set<unknown>()
  const instances: unknown[] = []
  for (const { instance } of entries) {
    if (!isShared(instance)) {
      instances.push(instance)
    } else if (!seen.has(instance)) {
      seen.add(instance)
      instances.push(instance)
    }
  }
  return instances
}

/**
 * Like `container.instances()`, without what the container did not build: the
 * values given to `provide()` and `addInstance()`, and auto-mocks.
 */
export function constructedInstances(container: Container): unknown[] {
  const entries = readyEntries(container)
  const isGiven = ({ record }: Entry) => record.kind === 'value' || record.isMock === true
  const given = new Set(entries.filter(isGiven).map((entry) => entry.instance))
  return instancesOf(
    entries.filter(
      (entry) => !isGiven(entry) && !(isShared(entry.instance) && given.has(entry.instance)),
    ),
  )
}

/**
 * Sends the errors of destroy hooks, in the container and in its scopes, to
 * `report`. A container that was created with a `logger` keeps using it, and
 * one created with `logger: null` stays silent.
 */
export function setErrorReporter(container: Container, report: ErrorReporter): void {
  if (!container.hasOwnReporter) {
    container.reportError = report
  }
}

/**
 * Makes `provider` the one this container uses for its token, as
 * `container.provide()` does. Returns `false`, and changes nothing, when the
 * token is already resolved in the container.
 */
export function setProvider(container: Container, provider: Provider): boolean {
  if (isResolved(container, provider.token)) {
    return false
  }
  container.overrides.set(provider.token, provider.record)
  return true
}

/** Whether the container was given a provider of its own for `token`. */
export function hasOwnProvider(
  container: Container,
  token: ClassType | InjectionToken<any, any>,
): boolean {
  const base = baseToken(token)
  return base !== undefined && container.overrides.has(base)
}
