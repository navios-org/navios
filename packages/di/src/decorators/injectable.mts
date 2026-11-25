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
import type { InjectionToken } from '../token/injection-token.mjs'
import type { PublicPart } from '../token/public-part.mjs'

import { assertClassDecorator } from './assert-class-decorator.mjs'

export interface InjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  schema?: StandardSchemaV1
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
export function Injectable<Schema extends StandardSchemaV1>(options: {
  scope?: InjectableScope
  schema: Schema
}): <T extends ClassTypeWithArgument<InferOutput<Schema>>>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #3 Class with a token (and the token's schema, if any). As with `provide()`,
// only the public members of the token's type count.
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
      : <T extends ClassTypeWithInstanceAndOptionalArgument<PublicPart<Type>, InferOutput<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
    : Type extends undefined
      ? <T extends ClassTypeWithArgument<InferOutput<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : <T extends ClassTypeWithInstanceAndArgument<PublicPart<Type>, InferOutput<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
  : <R extends ClassTypeWithInstance<PublicPart<Type>>>(
      target: R,
      context?: ClassDecoratorContext,
    ) => R

export function Injectable(options: InjectableOptions = {}) {
  return <T extends ClassType>(target: T, context?: ClassDecoratorContext): T => {
    assertClassDecorator('Injectable', context)
    registerInjectable(target, options)
    return target
  }
}
