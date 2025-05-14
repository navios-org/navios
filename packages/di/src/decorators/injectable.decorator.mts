import { NaviosException } from '@navios/common'

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
// #2 Factory class without arguments
export function Injectable<R>(options: {
  scope?: InjectableScope
  type: InjectableType.Factory
}): <T extends ClassTypeWithInstance<Factory<R>>>(
  target: T,
  context: ClassDecoratorContext,
) => T

// #3 Class with typeless token and schema
export function Injectable<Type, Schema>(options: {
  scope?: InjectableScope
  type?: InjectableType.Class
  token: InjectionToken<Type, Schema>
}): Schema extends BaseInjectionTokenSchemaType
  ? Type extends undefined
    ? <T extends ClassTypeWithArgument<z.output<Schema>>>(
        target: T,
        context: ClassDecoratorContext,
      ) => T
    : <T extends ClassTypeWithInstanceAndArgument<Type, z.output<Schema>>>(
        target: T,
        context: ClassDecoratorContext,
      ) => T
  : Schema extends OptionalInjectionTokenSchemaType
    ? Type extends undefined
      ? <T extends ClassTypeWithOptionalArgument<z.output<Schema>>>(
          target: T,
          context: ClassDecoratorContext,
        ) => T
      : <
          T extends ClassTypeWithInstanceAndOptionalArgument<
            Type,
            z.output<Schema>
          >,
        >(
          target: T,
          context: ClassDecoratorContext,
        ) => T
    : Schema extends undefined
      ? <R extends ClassTypeWithInstance<Type>>(
          target: R,
          context: ClassDecoratorContext,
        ) => R
      : never

// #4 Factory with typed token
export function Injectable<R, S>(options: {
  scope?: InjectableScope
  type: InjectableType.Factory
  token: InjectionToken<R, S>
}): R extends undefined
  ? never
  : S extends InjectionTokenSchemaType
    ? <T extends ClassTypeWithInstance<FactoryWithArgs<R, S>>>(
        target: T,
        context: ClassDecoratorContext,
      ) => T
    : S extends undefined
      ? <T extends ClassTypeWithInstance<Factory<R>>>(
          target: T,
          context: ClassDecoratorContext,
        ) => T
      : never
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
            throw new NaviosException(
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
