import { z } from 'zod/v4'

import type {
  BaseInjectionTokenSchemaType,
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
  ClassTypeWithInstanceAndOptionalArgument,
  ClassTypeWithOptionalArgument,
  ClassTypeWithoutArguments,
  InjectionTokenSchemaType,
  OptionalInjectionTokenSchemaType,
} from '../token/injection-token.mjs'
import type { Registry } from '../token/registry.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { globalRegistry } from '../token/registry.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface InjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  schema?: InjectionTokenSchemaType
  registry?: Registry
  priority?: number
}

// #1 Simple constructorless class
export function Injectable(): <T extends ClassTypeWithoutArguments>(
  target: T,
  context?: ClassDecoratorContext,
) => T
export function Injectable(options: {
  scope?: InjectableScope
  registry: Registry
  priority?: number
}): <T extends ClassTypeWithoutArguments>(
  target: T,
  context?: ClassDecoratorContext,
) => T
export function Injectable(options: {
  scope: InjectableScope
  priority?: number
}): <T extends ClassTypeWithoutArguments>(
  target: T,
  context?: ClassDecoratorContext,
) => T
// #2 Class with schema
export function Injectable<Schema extends InjectionTokenSchemaType>(options: {
  scope?: InjectableScope
  schema: Schema
  registry?: Registry
  priority?: number
}): <T extends ClassTypeWithArgument<z.output<Schema>>>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #3 Class with typeless token and schema
export function Injectable<Type, Schema>(options: {
  scope?: InjectableScope
  token: InjectionToken<Type, Schema>
  registry?: Registry
  priority?: number
}): Schema extends BaseInjectionTokenSchemaType
  ? Type extends undefined
    ? <T extends ClassTypeWithArgument<z.output<Schema>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
    : <T extends ClassTypeWithInstanceAndArgument<Type, z.output<Schema>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
  : Schema extends OptionalInjectionTokenSchemaType
    ? Type extends undefined
      ? <T extends ClassTypeWithOptionalArgument<z.output<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : <
          T extends ClassTypeWithInstanceAndOptionalArgument<
            Type,
            z.output<Schema>
          >,
        >(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
    : Schema extends undefined
      ? <R extends ClassTypeWithInstance<Type>>(
          target: R,
          context?: ClassDecoratorContext,
        ) => R
      : never

export function Injectable({
  scope = InjectableScope.Singleton,
  token,
  schema,
  registry = globalRegistry,
  priority = 0,
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
        '[DI] @Injectable decorator can only be used on classes.',
      )
    }
    if (schema && token) {
      throw new Error(
        '[DI] @Injectable decorator cannot have both a token and a schema',
      )
    }
    let injectableToken: InjectionToken<any, any> =
      token ?? InjectionToken.create(target, schema as InjectionTokenSchemaType)

    registry.set(injectableToken, scope, target, InjectableType.Class, priority)

    // @ts-expect-error
    target[InjectableTokenMeta] = injectableToken

    return target
  }
}

