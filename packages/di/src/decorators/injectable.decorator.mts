import { z } from 'zod'

import type {
  BaseInjectionTokenSchemaType,
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
  ClassTypeWithInstanceAndOptionalArgument,
  ClassTypeWithOptionalArgument,
  InjectionTokenSchemaType,
  OptionalInjectionTokenSchemaType,
} from '../injection-token.mjs'
import type { Factory, FactoryWithArgs } from '../interfaces/index.mjs'
import type { Registry } from '../registry.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { globalRegistry } from '../registry.mjs'
import { resolveService } from '../resolve-service.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface InjectableOptions {
  scope?: InjectableScope
  type?: InjectableType
  token?: InjectionToken<any, any>
  registry?: Registry
}
// #1 Simple constructorless class
export function Injectable(): <T extends ClassType>(
  target: T,
  context: ClassDecoratorContext,
) => T
export function Injectable(options: {
  registry: Registry
}): <T extends ClassType>(target: T, context: ClassDecoratorContext) => T

// #2 Factory without arguments
export function Injectable<R>(options: {
  scope?: InjectableScope
  type: InjectableType.Factory
  registry?: Registry
}): <T extends ClassTypeWithInstance<Factory<R>>>(
  target: T,
  context: ClassDecoratorContext,
) => T

// #3 Class with typeless token and schema
export function Injectable<Type, Schema>(options: {
  scope?: InjectableScope
  type?: InjectableType.Class
  token: InjectionToken<Type, Schema>
  registry?: Registry
}): Schema extends BaseInjectionTokenSchemaType // #3.1 Check that schema is an object or a record
  ? Type extends undefined
    ? <T extends ClassTypeWithArgument<z.output<Schema>>>( // #3.1.1 Typeless token
        target: T,
        context: ClassDecoratorContext,
      ) => T
    : <T extends ClassTypeWithInstanceAndArgument<Type, z.output<Schema>>>( // #3.1.2 Typed token
        target: T,
        context: ClassDecoratorContext,
      ) => T
  : Schema extends OptionalInjectionTokenSchemaType // #3.2 Check that schema is an optional object or a record
    ? Type extends undefined
      ? <T extends ClassTypeWithOptionalArgument<z.output<Schema>>>( // #3.2.1 Typeless token
          target: T,
          context: ClassDecoratorContext,
        ) => T
      : <
          // #3.2.2 Typed token
          T extends ClassTypeWithInstanceAndOptionalArgument<
            Type,
            z.output<Schema>
          >,
        >(
          target: T,
          context: ClassDecoratorContext,
        ) => T
    : Schema extends undefined // #3.3 Check that schema is undefined
      ? <R extends ClassTypeWithInstance<Type>>( // #3.3.1 Token must have a type
          target: R,
          context: ClassDecoratorContext,
        ) => R
      : never // #3.4 Cannot use a token without a type and schema

// #4 Factory with typed token
export function Injectable<R, S>(options: {
  scope?: InjectableScope
  type: InjectableType.Factory
  token: InjectionToken<R, S>
  registry?: Registry
}): R extends undefined // #4.1 Check that token has a type
  ? never // #4.1.1 Token must have a type
  : S extends InjectionTokenSchemaType // #4.2 Check that schema is an object or a record
    ? <T extends ClassTypeWithInstance<FactoryWithArgs<R, S>>>( // #4.2.1 Token have a schema
        target: T,
        context: ClassDecoratorContext,
      ) => T
    : S extends undefined // #4.3 For a factory without schema
      ? <T extends ClassTypeWithInstance<Factory<R>>>( // #4.3.1 Token without a schema
          target: T,
          context: ClassDecoratorContext,
        ) => T
      : never // #4.4 Cannot use a token without a type and schema
export function Injectable({
  scope = InjectableScope.Singleton,
  type = InjectableType.Class,
  token,
  registry = globalRegistry,
}: InjectableOptions = {}) {
  return <T extends ClassType>(
    target: T,
    context: ClassDecoratorContext,
  ): T => {
    if (context.kind !== 'class') {
      throw new Error(
        '[ServiceLocator] @Injectable decorator can only be used on classes.',
      )
    }
    let injectableToken: InjectionToken<any, any> =
      token ?? InjectionToken.create(target)
    if (type === InjectableType.Class) {
      registry.set(
        injectableToken,
        async (ctx, args: any) => resolveService(ctx, target, [args]),
        scope,
      )
    } else if (type === InjectableType.Factory) {
      registry.set(
        injectableToken,
        async (ctx, args: any) => {
          const builder = await resolveService(ctx, target)
          if (typeof builder.create !== 'function') {
            throw new Error(
              `[ServiceLocator] Factory ${target.name} does not implement the create method.`,
            )
          }
          return builder.create(ctx, args)
        },
        scope,
      )
    }

    // @ts-expect-error
    target[InjectableTokenMeta] = injectableToken

    return target
  }
}
