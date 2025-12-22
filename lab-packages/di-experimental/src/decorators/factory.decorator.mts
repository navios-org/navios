import type {
  ClassTypeWithInstance,
  InjectionTokenSchemaType,
} from '../token/injection-token.mjs'
import type { Factorable, FactorableWithArgs } from '../interfaces/index.mjs'
import type { Registry } from '../token/registry.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { globalRegistry } from '../token/registry.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface FactoryOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  registry?: Registry
  priority?: number
}

// #1 Factory without arguments
export function Factory<R>(options?: {
  scope?: InjectableScope
  registry?: Registry
  priority?: number
}): <T extends ClassTypeWithInstance<Factorable<R>>>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #2 Factory with typed token
export function Factory<R, S>(options: {
  scope?: InjectableScope
  token: InjectionToken<R, S>
  registry?: Registry
  priority?: number
}): R extends undefined
  ? never
  : S extends InjectionTokenSchemaType
    ? <T extends ClassTypeWithInstance<FactorableWithArgs<R, S>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
    : S extends undefined
      ? <T extends ClassTypeWithInstance<Factorable<R>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : never

export function Factory({
  scope = InjectableScope.Singleton,
  token,
  registry = globalRegistry,
  priority = 0,
}: FactoryOptions = {}) {
  return <
    T extends ClassTypeWithInstance<
      Factorable<any> | FactorableWithArgs<any, any>
    >,
  >(
    target: T,
    context?: ClassDecoratorContext,
  ): T => {
    if (
      (context && context.kind !== 'class') ||
      (target instanceof Function && !context)
    ) {
      throw new Error(
        '[DI] @Factory decorator can only be used on classes.',
      )
    }

    let injectableToken: InjectionToken<any, any> =
      token ?? InjectionToken.create(target)

    registry.set(injectableToken, scope, target, InjectableType.Factory, priority)

    // @ts-expect-error
    target[InjectableTokenMeta] = injectableToken

    return target
  }
}

