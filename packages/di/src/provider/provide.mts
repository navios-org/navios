import { DIError } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { findInjectableToken } from '../token/injectable-token.mjs'

import type { ClassType } from '../token/class-type.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import { createRecord } from './provider-record.mjs'

import type { FactoryContext } from './factory-context.mjs'
import type { ProviderKind, ProviderRecord } from './provider-record.mjs'

/**
 * A provider bound to a token, as accepted by `new Container({ providers })`
 * and `container.provide()`.
 */
export interface Provider {
  token: InjectionToken<any, any>
  record: ProviderRecord
}

export type ProviderInput<T> =
  | ClassType
  | { value: T }
  | { class: ClassType; scope?: InjectableScope }
  | { factory: (ctx: FactoryContext, args: any) => T | Promise<T>; scope?: InjectableScope }

function tokenOf(target: ClassType | InjectionToken<any, any>): InjectionToken<any, any> {
  if (typeof target !== 'function') {
    return target
  }
  const token = findInjectableToken(target)
  if (!token) {
    throw DIError.classNotInjectable(target.name)
  }
  return token
}

/**
 * Binds a token (or a class) to an implementation, a value or a factory.
 *
 * ```ts
 * new Container({ providers: [provide(Mailer, SesMailer), provide(Clock, { value: fakeClock })] })
 * ```
 *
 * A class implementation keeps the scope it was registered with unless a
 * scope is given explicitly.
 */
export function provide<T>(
  target: ClassType | InjectionToken<T, any>,
  impl: ProviderInput<T>,
): Provider {
  const token = tokenOf(target)
  if (typeof impl === 'function') {
    return { token, record: classRecord(token, impl, undefined) }
  }
  if ('value' in impl) {
    return {
      token,
      record: createRecord(
        token,
        'value',
        token.scope ?? InjectableScope.Singleton,
        undefined,
        undefined,
        impl.value,
      ),
    }
  }
  if ('class' in impl) {
    return { token, record: classRecord(token, impl.class, impl.scope) }
  }
  return {
    token,
    record: createRecord(
      token,
      'function',
      impl.scope ?? token.scope ?? InjectableScope.Singleton,
      undefined,
      impl.factory,
      undefined,
    ),
  }
}

function classRecord(
  token: InjectionToken<any, any>,
  target: ClassType,
  scope: InjectableScope | undefined,
): ProviderRecord {
  const own = findInjectableToken(target)?.provider
  const kind: ProviderKind = own?.target === target && own.kind === 'factory' ? 'factory' : 'class'
  return createRecord(
    token,
    kind,
    scope ?? (own?.target === target ? own.scope : undefined) ?? InjectableScope.Singleton,
    target,
    undefined,
    undefined,
  )
}
