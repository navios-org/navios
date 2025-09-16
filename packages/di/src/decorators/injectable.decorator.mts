import { z } from 'zod/v4'

import type {
  BaseInjectionTokenSchemaType,
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
  ClassTypeWithInstanceAndOptionalArgument,
  ClassTypeWithOptionalArgument,
  OptionalInjectionTokenSchemaType,
} from '../injection-token.mjs'
import type { Registry } from '../registry.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { globalRegistry } from '../registry.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface InjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  registry?: Registry
}
// #1 Simple constructorless class
export function Injectable(): <T extends ClassType>(
  target: T,
  context?: ClassDecoratorContext,
) => T
export function Injectable(options: {
  scope?: InjectableScope
  registry: Registry
}): <T extends ClassType>(target: T, context?: ClassDecoratorContext) => T
export function Injectable(options: {
  scope: InjectableScope
}): <T extends ClassType>(target: T, context?: ClassDecoratorContext) => T


// #3 Class with typeless token and schema
export function Injectable<Type, Schema>(options: {
  scope?: InjectableScope
  token: InjectionToken<Type, Schema>
  registry?: Registry
}): Schema extends BaseInjectionTokenSchemaType // #3.1 Check that schema is an object or a record
  ? Type extends undefined
    ? <T extends ClassTypeWithArgument<z.output<Schema>>>( // #3.1.1 Typeless token
        target: T,
        context?: ClassDecoratorContext,
      ) => T
    : <T extends ClassTypeWithInstanceAndArgument<Type, z.output<Schema>>>( // #3.1.2 Typed token
        target: T,
        context?: ClassDecoratorContext,
      ) => T
  : Schema extends OptionalInjectionTokenSchemaType // #3.2 Check that schema is an optional object or a record
    ? Type extends undefined
      ? <T extends ClassTypeWithOptionalArgument<z.output<Schema>>>( // #3.2.1 Typeless token
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : <
          // #3.2.2 Typed token
          T extends ClassTypeWithInstanceAndOptionalArgument<
            Type,
            z.output<Schema>
          >,
        >(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
    : Schema extends undefined // #3.3 Check that schema is undefined
      ? <R extends ClassTypeWithInstance<Type>>( // #3.3.1 Token must have a type
          target: R,
          context?: ClassDecoratorContext,
        ) => R
      : never // #3.4 Cannot use a token without a type and schema

export function Injectable({
  scope = InjectableScope.Singleton,
  token,
  registry = globalRegistry,
}: InjectableOptions = {}) {
  return <T extends ClassType>(
    target: T,
    context?: ClassDecoratorContext,
  ): T => {
    if (
      (context && context.kind !== 'class') ||
      (target instanceof Function && !context)
    ) {
      throw new Error(
        '[ServiceLocator] @Injectable decorator can only be used on classes.',
      )
    }
    let injectableToken: InjectionToken<any, any> =
      token ?? InjectionToken.create(target)
        
    registry.set(
      injectableToken,
      scope,
      target,
      InjectableType.Class,
    )

    // @ts-expect-error
    target[InjectableTokenMeta] = injectableToken

    return target
  }
}
