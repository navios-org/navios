import { classNotInjectable, foreignCopy } from '../errors/create.mjs'

import type { AbstractClassType, ClassType } from './class-type.mjs'
import type { InjectionToken } from './injection-token.mjs'

// Where a class keeps its token. Not shared between copies of the package: the
// `inject()` in a class belongs to the copy that registered it, and that copy
// knows nothing of a construction that another one runs.
const tokenOf = /* #__PURE__ */ Symbol('navios.di.token')
// Tells that some copy registered the class.
const registered = /* #__PURE__ */ Symbol.for('navios.di.registered')

const hasOwn = Object.prototype.hasOwnProperty

/**
 * Returns the token attached to a class by `@Injectable` / `@Factory`, or
 * `undefined` when the class is not registered.
 */
export function findInjectableToken(
  target: AbstractClassType,
): InjectionToken<any, any> | undefined {
  if (hasOwn.call(target, tokenOf)) {
    return (target as any)[tokenOf]
  }
  if (hasOwn.call(target, registered)) {
    throw foreignCopy(`Class ${target.name}`)
  }
  return undefined
}

export function attachToken(target: ClassType, token: InjectionToken<any, any>): void {
  Object.defineProperty(target, tokenOf, { value: token, configurable: true })
  Object.defineProperty(target, registered, { value: true, configurable: true })
}

export function getInjectableToken<R>(
  target: ClassType,
): R extends { create(...args: any[]): infer V } ? InjectionToken<V> : InjectionToken<R> {
  const token = findInjectableToken(target)
  if (!token) {
    throw classNotInjectable(target.name)
  }
  return token as any
}
