import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'
import { Token } from '../token/token.mjs'
import { globalRegistry } from '../token/registry.mjs'

import type { Factorable, FactorableWithArgs } from '../interfaces/index.mjs'
import type { StandardSchemaV1 } from '../token/schema.mjs'
import type { ClassTypeWithInstance } from '../token/token.mjs'
import type { Registry } from '../token/registry.mjs'

export interface FactoryOptions {
  scope?: InjectableScope
  token?: Token<any, any>
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
//
// In v2 a token's schema is always a StandardSchemaV1 and presence of a
// schema means args are required (the zod-optional "args optional" capability
// was dropped in v2), so the branches are exhaustive over StandardSchemaV1
// vs undefined.
export function Factory<R, S extends StandardSchemaV1 | undefined>(options: {
  scope?: InjectableScope
  token: Token<R, S>
  registry?: Registry
  priority?: number
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

export function Factory({
  scope = InjectableScope.Singleton,
  token,
  registry = globalRegistry,
  priority = 0,
}: FactoryOptions = {}) {
  return <T extends ClassTypeWithInstance<Factorable<any> | FactorableWithArgs<any, any>>>(
    target: T,
    context?: ClassDecoratorContext,
  ): T => {
    if ((context && context.kind !== 'class') || (target instanceof Function && !context)) {
      throw new Error('[DI] @Factory decorator can only be used on classes.')
    }

    let injectableToken: Token<any, any> = token ?? Token.create(target)

    registry.set(injectableToken, scope, target, InjectableType.Factory, priority)

    // @ts-expect-error
    target[InjectableTokenMeta] = injectableToken

    return target
  }
}
