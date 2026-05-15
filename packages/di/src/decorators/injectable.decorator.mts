import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'
import { Token } from '../token/token.mjs'
import { globalRegistry } from '../token/registry.mjs'

import type { StandardSchemaV1 } from '../token/schema.mjs'
import type {
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
  ClassTypeWithoutArguments,
  TokenSchemaType,
} from '../token/token.mjs'
import type { Registry } from '../token/registry.mjs'

export interface InjectableOptions {
  scope?: InjectableScope
  token?: Token<any, any>
  schema?: TokenSchemaType
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
}): <T extends ClassTypeWithoutArguments>(target: T, context?: ClassDecoratorContext) => T
export function Injectable(options: {
  scope: InjectableScope
  priority?: number
}): <T extends ClassTypeWithoutArguments>(target: T, context?: ClassDecoratorContext) => T
// #2 Class with schema
export function Injectable<Schema extends TokenSchemaType>(options: {
  scope?: InjectableScope
  schema: Schema
  registry?: Registry
  priority?: number
}): <T extends ClassTypeWithArgument<StandardSchemaV1.InferOutput<Schema>>>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #3 Class with typeless token and schema
//
// In v2 a token's schema is always a StandardSchemaV1 and presence of a
// schema means args are required (the zod-optional "args optional" capability
// was dropped in v2), so there is no separate "optional schema" branch.
export function Injectable<Type, Schema extends StandardSchemaV1 | undefined>(options: {
  scope?: InjectableScope
  token: Token<Type, Schema>
  registry?: Registry
  priority?: number
}): Schema extends StandardSchemaV1
  ? Type extends undefined
    ? <T extends ClassTypeWithArgument<StandardSchemaV1.InferOutput<Schema>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
    : <T extends ClassTypeWithInstanceAndArgument<Type, StandardSchemaV1.InferOutput<Schema>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
  : <R extends ClassTypeWithInstance<Type>>(target: R, context?: ClassDecoratorContext) => R

export function Injectable({
  scope = InjectableScope.Singleton,
  token,
  schema,
  registry = globalRegistry,
  priority = 0,
}: InjectableOptions = {}) {
  return <T extends ClassType>(target: T, context?: ClassDecoratorContext): T => {
    if ((context && context.kind !== 'class') || (target instanceof Function && !context)) {
      throw new Error('[DI] @Injectable decorator can only be used on classes.')
    }
    if (schema && token) {
      throw new Error('[DI] @Injectable decorator cannot have both a token and a schema')
    }
    let injectableToken: Token<any, any> =
      token ?? Token.create(target, schema as TokenSchemaType)

    registry.set(injectableToken, scope, target, InjectableType.Class, priority)

    // @ts-expect-error
    target[InjectableTokenMeta] = injectableToken

    return target
  }
}
