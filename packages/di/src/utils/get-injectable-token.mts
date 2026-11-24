import { DIError } from '../errors/di-error.mjs'
import { findInjectableToken } from '../token/provider.mjs'

import type { ClassType, InjectionToken } from '../token/injection-token.mjs'

export function getInjectableToken<R>(
  target: ClassType,
): R extends { create(...args: any[]): infer V } ? InjectionToken<V> : InjectionToken<R> {
  const token = findInjectableToken(target)
  if (!token) {
    throw DIError.classNotInjectable(target.name)
  }
  return token as any
}
