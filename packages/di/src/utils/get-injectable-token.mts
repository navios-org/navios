import { DIError } from '../errors/di-error.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'

import type { ClassType, InjectionToken } from '../token/injection-token.mjs'

export function getInjectableToken<R>(
  target: ClassType,
): R extends { create(...args: any[]): infer V } ? InjectionToken<V> : InjectionToken<R> {
  // @ts-expect-error We inject the token into the class itself
  const token = target[InjectableTokenMeta] as InjectionToken<any, any>
  if (!token) {
    throw DIError.classNotInjectable(target.name)
  }
  // @ts-expect-error We detect factory or class
  return token
}
