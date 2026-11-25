import { registerInjectable } from '../provider/registration.mjs'

import type { InjectableScope } from '../injectable-scope.mjs'
import type { InferInput, InferOutput, StandardSchemaV1 } from '../schema/standard-schema.mjs'
import type {
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
  ClassTypeWithInstanceAndOptionalArgument,
  ClassTypeWithOptionalArgument,
  ClassTypeWithoutArguments,
} from '../token/class-type.mjs'
import type { InjectionToken, InjectionTokenSchemaType } from '../token/injection-token.mjs'

export interface InjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  schema?: InjectionTokenSchemaType
}

// #1 Simple constructorless class
export function Injectable(): <T extends ClassTypeWithoutArguments>(
  target: T,
  context?: ClassDecoratorContext,
) => T
export function Injectable(options: {
  scope: InjectableScope
}): <T extends ClassTypeWithoutArguments>(target: T, context?: ClassDecoratorContext) => T
// #2 Class with schema
export function Injectable<Schema extends InjectionTokenSchemaType>(options: {
  scope?: InjectableScope
  schema: Schema
}): <T extends ClassTypeWithArgument<InferOutput<Schema>>>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #3 Class with a token (and the token's schema, if any)
export function Injectable<Type, Schema>(options: {
  scope?: InjectableScope
  token: InjectionToken<Type, Schema>
}): Schema extends StandardSchemaV1
  ? undefined extends InferInput<Schema>
    ? Type extends undefined
      ? <T extends ClassTypeWithOptionalArgument<InferOutput<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : <T extends ClassTypeWithInstanceAndOptionalArgument<Type, InferOutput<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
    : Type extends undefined
      ? <T extends ClassTypeWithArgument<InferOutput<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : <T extends ClassTypeWithInstanceAndArgument<Type, InferOutput<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
  : <R extends ClassTypeWithInstance<Type>>(target: R, context?: ClassDecoratorContext) => R

export function Injectable(options: InjectableOptions = {}) {
  return <T extends ClassType>(target: T, context?: ClassDecoratorContext): T => {
    if ((context && context.kind !== 'class') || (target instanceof Function && !context)) {
      throw new Error('[DI] @Injectable decorator can only be used on classes.')
    }
    registerInjectable(target, options)
    return target
  }
}
