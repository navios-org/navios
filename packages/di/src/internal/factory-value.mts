import { InjectableScope } from '../injectable-scope.mjs'
import { createRecord } from '../provider/provider-record.mjs'

import type { DIError } from '../errors/di-error.mjs'
import type { FactoryInjectionToken } from '../token/injection-token.mjs'

import { createEntry, markReady } from './entry.mjs'
import { outside } from './frame.mjs'
import { createFactoryContext } from './inject-impl.mjs'
import { assertLive } from './liveness.mjs'
import { failEntry, settleEntry } from './outcome.mjs'
import { isThenable, noop } from './thenable.mjs'

import type { Entry } from './entry.mjs'
import type { RootHost } from './host.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The args a factory token stands for. They are cached per root container, so
 * they are computed against the root and outside any construction: a scope's
 * own values must not leak into them.
 */
export function factoryValue(root: RootHost, raw: FactoryInjectionToken<any, any>): Entry {
  const known = root.factoryValues.get(raw)
  if (known !== undefined) {
    return known
  }
  assertLive(root)
  const entry = createEntry(
    createRecord('function', InjectableScope.Singleton, undefined, raw.factory, undefined),
    raw.token,
    null,
    undefined,
    root,
    null,
    null,
  )
  root.factoryValues.set(raw, entry)

  const fail = (error: unknown): DIError => {
    root.factoryValues.delete(raw)
    return failEntry(entry, error, null)
  }
  let result: unknown
  try {
    result = outside(() => raw.factory(createFactoryContext(entry)))
  } catch (error) {
    throw fail(error)
  }
  if (isThenable(result)) {
    entry.promise = Promise.resolve(result).then(
      (value) => settleEntry(entry, value),
      (error) => {
        throw fail(error)
      },
    )
    entry.promise.catch(noop)
  } else {
    markReady(entry, result)
  }
  return entry
}
