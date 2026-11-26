import {
  circularDependency,
  classNotInjectable,
  foreignCopy,
  notInjectable,
} from '../errors/create.mjs'
import { findInjectableToken } from '../token/injectable-token.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { AnyInjectableType } from '../token/injection-token.mjs'

import type { Host, RootHost } from './host.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * What a reference stands for and which provider serves it, without building
 * or computing anything.
 */

/** The error for something that is neither a class nor a token of this copy. */
export function unknownReference(raw: unknown): Error {
  if (typeof raw === 'object' && raw !== null && 'name' in raw && 'schema' in raw) {
    return foreignCopy(`Token ${String(raw)}`)
  }
  return notInjectable(raw)
}

/**
 * The token behind any injectable reference, without resolving anything;
 * `undefined` for a class that is not registered.
 */
export function baseToken(raw: AnyInjectableType): InjectionToken<any, any> | undefined {
  if (typeof raw === 'function') {
    return findInjectableToken(raw)
  }
  if (raw instanceof InjectionToken) {
    return raw
  }
  if (raw instanceof BoundInjectionToken || raw instanceof FactoryInjectionToken) {
    return raw.token
  }
  throw unknownReference(raw)
}

export function requireToken(raw: AnyInjectableType): InjectionToken<any, any> {
  const token = baseToken(raw)
  if (token === undefined) {
    throw classNotInjectable((raw as { name: string }).name)
  }
  return token
}

export function lookupRecord(
  host: Host,
  token: InjectionToken<any, any>,
): ProviderRecord | undefined {
  const root = host.root
  const own = root.overrides.get(token)
  if (own !== undefined) {
    return own
  }
  return root.strict ? root.providerForUnlisted(token) : token.provider
}

// What an alias (`{ existing }`) points to in the end, with the args that the
// way there adds. Anything else is returned as it is. `passed` collects the
// aliases on the way.
export function followAlias(
  host: Host,
  raw: AnyInjectableType,
  passed?: Set<InjectionToken<any, any>>,
): AnyInjectableType {
  let target = raw
  let withArgs: BoundInjectionToken<any, any> | FactoryInjectionToken<any, any> | null = null
  const seen: InjectionToken<any, any>[] = []
  for (;;) {
    if (target instanceof BoundInjectionToken || target instanceof FactoryInjectionToken) {
      withArgs = target
    }
    const token = baseToken(target)
    const record = token === undefined ? undefined : lookupRecord(host, token)
    if (token === undefined || record === undefined || record.kind !== 'existing') {
      break
    }
    seen.push(token)
    passed?.add(token)
    target = record.value as AnyInjectableType
    const next = baseToken(target)
    if (next !== undefined && seen.includes(next)) {
      throw circularDependency([...seen, next].map(String))
    }
  }
  if (withArgs === null || withArgs === target) {
    return target
  }
  // A factory token is known by its identity, so it stays the one that computes
  // the args, for an alias that is followed in turn.
  return withArgs instanceof FactoryInjectionToken
    ? withArgs
    : new BoundInjectionToken(requireToken(target), withArgs.value)
}

// The token of what `raw` stands for, aliases being followed to their end.
export function finalToken(
  host: Host,
  raw: AnyInjectableType,
): InjectionToken<any, any> | undefined {
  const token = baseToken(followAlias(host, raw))
  return token === undefined ? undefined : baseToken(followAlias(host, token))
}

/** The provider of what `raw` stands for, aliases being followed to their end. */
export function finalRecord(host: Host, raw: AnyInjectableType): ProviderRecord | undefined {
  const token = finalToken(host, raw)
  return token === undefined ? undefined : lookupRecord(host, token)
}

// Whether `root` holds an instance for `token`. For an alias that is what it
// points to, once somebody asked for it by that alias.
export function isResolved(root: RootHost, token: InjectionToken<any, any>): boolean {
  if (root.store.hasToken(token)) {
    return true
  }
  const target = aliasTarget(root, token)
  return target !== undefined && root.store.hasToken(target)
}

// What an alias that was asked for in `root` points to.
export function aliasTarget(
  root: RootHost,
  alias: InjectionToken<any, any>,
): InjectionToken<any, any> | undefined {
  return root.usedAliases?.has(alias) === true ? finalToken(root, alias) : undefined
}

export function hasInstance(host: Host, token: InjectionToken<any, any>): boolean {
  return (host.isScope && host.store.hasToken(token)) || host.root.store.hasToken(token)
}

export function hasProvider(host: Host, raw: AnyInjectableType): boolean {
  const token = baseToken(raw)
  if (token === undefined) {
    return false
  }
  if (hasInstance(host, token)) {
    return true
  }
  const record = lookupRecord(host, token)
  if (record === undefined || record.kind !== 'existing') {
    return record !== undefined
  }
  // An alias is provided when what it points to in the end is, as resolving
  // it follows the alias there.
  const final = finalToken(host, token)
  return (
    final !== undefined && (hasInstance(host, final) || lookupRecord(host, final) !== undefined)
  )
}
