import { DIError } from '../errors/di-error.mjs'
import { validateSync } from '../schema/standard-schema.mjs'
import { findInjectableToken } from '../token/injectable-token.mjs'
import { BoundInjectionToken, FactoryInjectionToken } from '../token/injection-token.mjs'

import type { InjectableScope } from '../injectable-scope.mjs'
import type { AnyInjectableType, InjectionToken } from '../token/injection-token.mjs'

import { argsKey } from './args-key.mjs'
import { createEntry, EntryStatus } from './entry.mjs'
import { baseToken } from './normalize.mjs'
import { noop } from './thenable.mjs'

import type { Entry } from './entry.mjs'
import type { Host } from './host.mjs'
import type { Store } from './store.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

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
