import { InjectableScope } from '../injectable-scope.mjs'
import { requireToken } from '../internal/lookup.mjs'
import { findInjectableToken } from '../token/injectable-token.mjs'

import type { ClassType, ClassTypeWithInstance } from '../token/class-type.mjs'
import type {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'
import type { PublicPart } from '../token/public-part.mjs'

import { createRecord } from './provider-record.mjs'

import type { Factorable, ProvidedFor } from './factorable.mjs'
import type { FactoryContext } from './factory-context.mjs'
import type { ProviderKind, ProviderRecord } from './provider-record.mjs'

/**
 * A provider bound to a token, as accepted by `new Container({ providers })`
 * and `container.provide()`.
 */
export interface Provider {
  readonly token: InjectionToken<any, any>
  /** @internal */
  readonly record: ProviderRecord
}

/** A class whose instances, or whose products if it is a `@Factory`, are a `T`. */
type ImplementationOf<T> = ClassTypeWithInstance<PublicPart<T> | Factorable<PublicPart<T>>>

type FactoryOf<T> = (ctx: FactoryContext, args: any) => PublicPart<T> | Promise<PublicPart<T>>

type ProviderForms<T, F> =
  | ImplementationOf<T>
  | { value: PublicPart<T> }
  | { class: ImplementationOf<T>; scope?: InjectableScope }
  | { factory: F; scope?: InjectableScope }
  | {
      /** Another class or token: the same instance, with the same lifecycle. */
      existing:
        | ImplementationOf<T>
        | InjectionToken<PublicPart<T>, any>
        | BoundInjectionToken<PublicPart<T>, any>
        | FactoryInjectionToken<PublicPart<T>, any>
    }

/**
 * How to come by a `T`. Only the public members of a class count: a mock does
 * not have to declare its private ones.
 */
export type ProviderInput<T> = ProviderForms<T, FactoryOf<T>>

/**
 * A `ProviderInput` for the class or token `K`. The type of a factory is a
 * condition on `K`, so that TypeScript looks at what `K` was inferred to be
 * before it checks the function: literals in what it returns keep their types.
 */
export type ProviderInputFor<K> = ProviderForms<
  ProvidedFor<K>,
  K extends unknown ? FactoryOf<ProvidedFor<K>> : never
>

/**
 * Binds a token (or a class) to an implementation, a value, a factory or
 * another token.
 *
 * ```ts
 * new Container({ providers: [provide(Mailer, SesMailer), provide(Clock, { value: fakeClock })] })
 * ```
 *
 * Unless a scope is given, the binding keeps the scope of the token's default
 * provider; a token without one takes the scope of a class implementation.
 */
export function provide<K extends ClassType | InjectionToken<any, any>>(
  target: K,
  impl: ProviderInputFor<K>,
): Provider {
  const token = requireToken(target)
  return { token, record: recordFor(token, impl) }
}

function recordFor(token: InjectionToken<any, any>, impl: ProviderInput<any>): ProviderRecord {
  if (typeof impl === 'function') {
    return classRecord(token, impl, undefined)
  }
  if ('class' in impl) {
    return classRecord(token, impl.class, impl.scope)
  }
  const scope = tokenScope(token) ?? InjectableScope.Singleton
  if ('value' in impl) {
    return createRecord('value', scope, undefined, undefined, impl.value)
  }
  if ('existing' in impl) {
    return createRecord('existing', scope, undefined, undefined, impl.existing)
  }
  return createRecord('function', impl.scope ?? scope, undefined, impl.factory, undefined)
}

function tokenScope(token: InjectionToken<any, any>): InjectableScope | undefined {
  return token.provider?.scope ?? token.scope
}

function classRecord(
  token: InjectionToken<any, any>,
  target: ClassType,
  scope: InjectableScope | undefined,
): ProviderRecord {
  const own = findInjectableToken(target)?.provider
  const kind: ProviderKind = own?.target === target && own.kind === 'factory' ? 'factory' : 'class'
  return createRecord(
    kind,
    scope ??
      tokenScope(token) ??
      (own?.target === target ? own.scope : undefined) ??
      InjectableScope.Singleton,
    target,
    undefined,
    undefined,
  )
}
