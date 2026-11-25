import { DIError } from '../errors/di-error.mjs'
import { findInjectableToken } from '../token/injectable-token.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { AnyInjectableType } from '../token/injection-token.mjs'

import { isThenable, noop } from './thenable.mjs'

import type { FactoryValue, Host } from './host.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

// `normalize` reports its result through these to avoid an allocation per call.
export let normToken: InjectionToken<any, any> = undefined as never
export let normArgs: unknown = undefined

/**
 * Reduces any injectable reference to a plain token plus args. Returns a
 * promise when a factory token's value is not computed yet.
 */
export function normalize(
  host: Host,
  raw: AnyInjectableType,
  rawArgs: unknown,
): Promise<unknown> | null {
  if (typeof raw === 'function') {
    const token = findInjectableToken(raw)
    if (token === undefined) {
      throw DIError.classNotInjectable(raw.name)
    }
    normToken = token
    normArgs = rawArgs
    return null
  }
  if (raw instanceof InjectionToken) {
    normToken = raw
    normArgs = rawArgs
    return null
  }
  if (raw instanceof BoundInjectionToken) {
    normToken = raw.token
    normArgs = raw.value
    return null
  }
  if (raw instanceof FactoryInjectionToken) {
    const state = factoryValue(host, raw)
    if (!state.done) {
      return state.promise!
    }
    normToken = raw.token
    normArgs = state.value
    return null
  }
  throw DIError.unknown(`[DI] ${String(raw)} is not an injectable class or token`)
}

function factoryValue(host: Host, token: FactoryInjectionToken<any, any>): FactoryValue {
  const values = host.root.factoryValues
  let state = values.get(token)
  if (state !== undefined) {
    return state
  }
  state = { done: false, value: undefined, promise: null }
  values.set(token, state)
  const created = state
  // The value is cached per root container, so it is computed against the
  // root: a scope's own values must not leak into it.
  const container = host.root.facade
  let result: unknown
  try {
    result = token.factory({
      inject: (t, a) => (container as any).get(t, a),
      container,
      addDestroyListener: noop,
    })
  } catch (error) {
    values.delete(token)
    throw error
  }
  if (isThenable(result)) {
    const promise = Promise.resolve(result).then(
      (value) => {
        created.value = value
        created.done = true
        created.promise = null
      },
      (error) => {
        values.delete(token)
        throw error
      },
    )
    promise.catch(noop)
    created.promise = promise
  } else {
    created.value = result
    created.done = true
  }
  return created
}

/**
 * The token behind any injectable reference, without resolving anything.
 * @internal
 */
export function baseToken(raw: AnyInjectableType): InjectionToken<any, any> | undefined {
  if (typeof raw === 'function') {
    return findInjectableToken(raw)
  }
  if (raw instanceof InjectionToken) {
    return raw
  }
  return (raw as BoundInjectionToken<any, any>).token
}

/** @internal */
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

/** @internal */
export function hasProvider(host: Host, raw: AnyInjectableType): boolean {
  const token = baseToken(raw)
  if (token === undefined) {
    return false
  }
  return (
    (host.isScope && host.store.hasToken(token)) ||
    host.root.store.hasToken(token) ||
    lookupRecord(host, token) !== undefined
  )
}
