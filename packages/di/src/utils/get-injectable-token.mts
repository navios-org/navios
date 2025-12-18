import type { ClassType, InjectionToken } from '../token/injection-token.mjs'

import { InjectableTokenMeta } from '../symbols/index.mjs'

export function getInjectableToken<R>(
  target: ClassType,
): R extends { create(...args: any[]): infer V }
  ? InjectionToken<V>
  : InjectionToken<R> {
  // @ts-expect-error We inject the token into the class itself
  const token = target[InjectableTokenMeta] as InjectionToken<any, any>
  if (!token) {
    throw new Error(
      `[ServiceLocator] Class ${target.name} is not decorated with @Injectable.`,
    )
  }
  // @ts-expect-error We detect factory or class
  return token
}
