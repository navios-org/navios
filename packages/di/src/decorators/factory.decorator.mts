import type {
  ClassTypeWithInstance,
  InjectionTokenSchemaType,
} from '../injection-token.mjs'
import type { Factorable, FactorableWithArgs } from '../interfaces/index.mjs'
import type { Registry } from '../registry.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { globalRegistry } from '../registry.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface FactoryOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  registry?: Registry
}

// #1 Factory without arguments
export function Factory<R>(options?: {
  scope?: InjectableScope
  registry?: Registry
}): <T extends ClassTypeWithInstance<Factorable<R>>>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #2 Factory with typed token
export function Factory<R, S>(options: {
  scope?: InjectableScope
  token: InjectionToken<R, S>
  registry?: Registry
}): R extends undefined // #2.1 Check that token has a type
  ? never // #2.1.1 Token must have a type
  : S extends InjectionTokenSchemaType // #2.2 Check that schema is an object or a record
    ? <T extends ClassTypeWithInstance<FactorableWithArgs<R, S>>>( // #2.2.1 Token have a schema
        target: T,
        context?: ClassDecoratorContext,
      ) => T
    : S extends undefined // #2.3 For a factory without schema
      ? <T extends ClassTypeWithInstance<Factorable<R>>>( // #2.3.1 Token without a schema
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : never // #2.4 Cannot use a token without a type and schema

export function Factory({
  scope = InjectableScope.Singleton,
  token,
  registry = globalRegistry,
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
        '[ServiceLocator] @Factory decorator can only be used on classes.',
      )
    }

    let injectableToken: InjectionToken<any, any> =
      token ?? InjectionToken.create(target)

    registry.set(injectableToken, scope, target, InjectableType.Factory)

    // @ts-expect-error
    target[InjectableTokenMeta] = injectableToken

    return target
  }
}
