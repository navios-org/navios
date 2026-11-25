import { DIError } from '../errors/di-error.mjs'

import type { ClassType } from './class-type.mjs'
import type { InjectionToken } from './injection-token.mjs'

export const InjectableTokenMeta = /* #__PURE__ */ Symbol.for('InjectableTokenMeta')

/**
 * Returns the token attached to a class by `@Injectable` / `@Factory`, or
 * `undefined` when the class is not registered.
 */
export function findInjectableToken(target: ClassType): InjectionToken<any, any> | undefined {
  return Object.prototype.hasOwnProperty.call(target, InjectableTokenMeta)
    ? ((target as any)[InjectableTokenMeta] as InjectionToken<any, any>)
    : undefined
}

export function getInjectableToken<R>(
  target: ClassType,
): R extends { create(...args: any[]): infer V } ? InjectionToken<V> : InjectionToken<R> {
  const token = findInjectableToken(target)
  if (!token) {
    throw DIError.classNotInjectable(target.name)
  }
  return token as any
}
