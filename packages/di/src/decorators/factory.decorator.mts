import { registerFactory } from '../token/provider.mjs'

import type { InjectableScope } from '../enums/index.mjs'
import type { Factorable, FactorableWithArgs } from '../interfaces/index.mjs'
import type { StandardSchemaV1 } from '../schema/standard-schema.mjs'
import type { ClassTypeWithInstance, InjectionToken } from '../token/injection-token.mjs'

export interface FactoryOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
}

export function Factory<R>(options?: {
  scope?: InjectableScope
}): <T extends ClassTypeWithInstance<Factorable<R>>>(
  target: T,
  context?: ClassDecoratorContext,
) => T

export function Factory<R, S>(options: {
  scope?: InjectableScope
  token: InjectionToken<R, S>
}): R extends undefined
  ? never
  : S extends StandardSchemaV1
    ? <T extends ClassTypeWithInstance<FactorableWithArgs<R, S>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
    : <T extends ClassTypeWithInstance<Factorable<R>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T

export function Factory(options: FactoryOptions = {}) {
  return <T extends ClassTypeWithInstance<Factorable<any> | FactorableWithArgs<any, any>>>(
    target: T,
    context?: ClassDecoratorContext,
  ): T => {
    if ((context && context.kind !== 'class') || (target instanceof Function && !context)) {
      throw new Error('[DI] @Factory decorator can only be used on classes.')
    }
    registerFactory(target, options)
    return target
  }
}
