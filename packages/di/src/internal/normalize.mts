import { classNotInjectable } from '../errors/create.mjs'
import { findInjectableToken } from '../token/injectable-token.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import type { AnyInjectableType } from '../token/injection-token.mjs'

import { EntryStatus } from './entry.mjs'
import { factoryValue } from './factory-value.mjs'
import { current, rethrowFailure } from './frame.mjs'
import { unknownReference } from './lookup.mjs'

import type { Entry } from './entry.mjs'
import type { Host } from './host.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

// `normalize` reports its result through these to avoid an allocation per call.
export let normToken: InjectionToken<any, any> = undefined as never
export let normArgs: unknown = undefined

/**
 * Reduces any injectable reference to a plain token plus args. Returns the
 * value of a factory token if it is still being computed.
 */
export function normalize(host: Host, raw: AnyInjectableType, rawArgs: unknown): Entry | null {
  if (typeof raw === 'function') {
    const token = findInjectableToken(raw)
    if (token === undefined) {
      throw classNotInjectable(raw.name)
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
    if (current !== null && current.failures !== null) {
      rethrowFailure(current, raw, null)
    }
    const value = factoryValue(host.root, raw)
    if (value.status === EntryStatus.Creating) {
      return value
    }
    normToken = raw.token
    normArgs = value.instance
    return null
  }
  throw unknownReference(raw)
}
