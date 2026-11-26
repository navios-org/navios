import { argsRequired, misuse, requestInstanceInRoot } from '../errors/create.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { createRecord } from '../provider/provider-record.mjs'
import { validateSync } from '../schema/standard-schema.mjs'
import { BoundInjectionToken, FactoryInjectionToken } from '../token/injection-token.mjs'

import type { AbstractClassType } from '../token/class-type.mjs'
import type { AnyInjectableType, InjectionToken } from '../token/injection-token.mjs'

import { keyOf } from './args-key.mjs'
import { createEntry, EntryStatus, markReady } from './entry.mjs'
import { assertLive } from './liveness.mjs'
import { baseToken, followAlias, lookupRecord, requireToken } from './normalize.mjs'
import { findStored } from './store.mjs'

import type { Entry } from './entry.mjs'
import type { Host } from './host.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Looks up a ready instance without constructing anything.
 */
export function findReady(host: Host, raw: AnyInjectableType, rawArgs: unknown): Entry | undefined {
  const token = baseToken(raw)
  if (token === undefined) {
    return undefined
  }
  let args = rawArgs
  if (raw instanceof BoundInjectionToken) {
    args = raw.value
  } else if (raw instanceof FactoryInjectionToken) {
    const value = host.root.factoryValues.get(raw)
    if (value === undefined || value.status !== EntryStatus.Ready) {
      return undefined
    }
    args = value.instance
  }
  if (token.schema !== undefined) {
    try {
      args = validateSync(token.schema, args, token.toString())
    } catch {
      return undefined
    }
  }
  const entry = findStored(host, token, keyOf(args))
  return entry !== undefined && entry.status === EntryStatus.Ready ? entry : undefined
}

/**
 * The `peek()` method of containers. Unlike `findReady` it also sees what an
 * alias points to.
 */
export function peek(this: Host, raw: AnyInjectableType, rawArgs?: unknown): unknown {
  const entry = findReady(this, raw, rawArgs) ?? findReady(this, followAlias(this, raw), rawArgs)
  return entry === undefined ? null : entry.instance
}

/**
 * Stores a ready value for a token in `host`.
 */
export function storeValue(
  host: Host,
  raw: ClassOrToken,
  value: unknown,
  scope: InjectableScope,
): void {
  assertLive(host)
  const token = requireToken(raw as AnyInjectableType)
  let args: unknown
  if (raw instanceof BoundInjectionToken) {
    args = raw.value
    if (token.schema !== undefined) {
      args = validateSync(token.schema, args, token.toString())
    }
  } else if (token.schema !== undefined) {
    // Without args it can only be stored for the args that the schema makes
    // of nothing.
    try {
      args = validateSync(token.schema, undefined, token.toString())
    } catch {
      throw argsRequired(token.toString())
    }
  }
  if (!host.isScope) {
    const declared = lookupRecord(host, token)?.scope ?? token.scope
    if (declared === InjectableScope.Request) {
      throw requestInstanceInRoot(token.toString())
    }
  }
  const key = keyOf(args)
  const existing = host.store.get(token, key)
  if (existing !== undefined && existing.status <= EntryStatus.Ready) {
    throw misuse(
      `${token.toString()} already has an instance in this container; invalidate it before adding another`,
    )
  }
  const entry = createEntry(
    createRecord('value', scope, undefined, undefined, value),
    token,
    key,
    args,
    host,
    host.store,
    null,
  )
  const hooks = value as { onServiceDestroy?: () => void | Promise<void> } | null
  if (hooks !== null && typeof hooks === 'object' && typeof hooks.onServiceDestroy === 'function') {
    entry.destroyListeners = [() => hooks.onServiceDestroy!()]
  }
  host.store.set(token, key, entry)
  markReady(entry, value)
}

type ClassOrToken = AbstractClassType | InjectionToken<any, any> | BoundInjectionToken<any, any>
