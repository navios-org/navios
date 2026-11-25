import { misuse, providerConflict } from '../errors/create.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { attachToken } from '../token/injectable-token.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

import type { StandardSchemaV1 } from '../schema/standard-schema.mjs'
import type { ClassType } from '../token/class-type.mjs'

import { provide } from './provide.mjs'
import { createRecord } from './provider-record.mjs'

import type { ResolvedInstance } from './factorable.mjs'
import type { ProviderInput, ProviderInputFor } from './provide.mjs'
import type { ProviderRecord } from './provider-record.mjs'

function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production'
  } catch {
    // No `process` in a browser, unless the bundler replaced the expression.
    return false
  }
}

// Whether `next` may take the place of `current` without being a conflict. The
// newest definition wins when the module may have been evaluated again (hot
// reload, or a test that redefines a class). Not in production, where nothing
// is, and where a minifier gives unrelated classes the same name.
function mayReplace(current: ProviderRecord, next: ProviderRecord): boolean {
  if (current.target !== undefined && next.target !== undefined) {
    return (
      current.target === next.target ||
      (current.target.name !== '' && current.target.name === next.target.name && !isProduction())
    )
  }
  const isSame = current.fn === next.fn && Object.is(current.value, next.value)
  return current.kind === next.kind && (isSame || !isProduction())
}

// What a definition without a class has in place of a name.
function appearance({ kind, fn, value }: ProviderRecord): string {
  const shown = kind === 'value' && typeof value === 'object' ? value?.constructor : value
  return String(fn ?? (typeof shown === 'function' ? shown.name : shown))
}

function describe(record: ProviderRecord): string {
  return record.target?.name || record.kind
}

function setDefaultProvider(token: InjectionToken<any, any>, record: ProviderRecord): void {
  const existing = token.provider
  if (existing !== undefined) {
    if (!mayReplace(existing, record)) {
      throw providerConflict(token.toString(), describe(existing), describe(record))
    }
    if (appearance(existing) !== appearance(record)) {
      console.warn(
        `[Navios] ${token} got another default provider (${describe(record)}). Unless its module ` +
          `was loaded again, that is a ProviderConflict in production.`,
      )
    }
  }
  token.provider = record
}

export interface RegisterInjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  schema?: StandardSchemaV1
}

/**
 * Registers a class as injectable without decorator syntax. `@Injectable`
 * calls this, so both paths behave identically.
 */
export function registerInjectable<T extends ClassType>(
  target: T,
  { scope = InjectableScope.Singleton, token, schema }: RegisterInjectableOptions = {},
): InjectionToken<InstanceType<T>, any> {
  if (schema && token) {
    throw misuse('@Injectable decorator cannot have both a token and a schema')
  }
  return register(target, 'class', scope, token ?? new InjectionToken(target, schema))
}

export interface RegisterFactoryOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
}

/**
 * Registers a factory class (`create(ctx, args)`) without decorator syntax.
 */
export function registerFactory(
  target: ClassType,
  { scope = InjectableScope.Singleton, token }: RegisterFactoryOptions = {},
): InjectionToken<any, any> {
  return register(target, 'factory', scope, token ?? new InjectionToken(target))
}

function register(
  target: ClassType,
  kind: 'class' | 'factory',
  scope: InjectableScope,
  token: InjectionToken<any, any>,
): InjectionToken<any, any> {
  setDefaultProvider(token, createRecord(token, kind, scope, target, undefined, undefined))
  attachToken(target, token)
  return token
}

export interface RegisterProviderOptions {
  /** Overrides the scope that `provide()` would give the provider. */
  scope?: InjectableScope
}

/**
 * Makes `input` the default provider of a token, in every container that does
 * not replace it with `provide()`. A token has one default provider: a second,
 * different one is a `ProviderConflict`, as with `@Injectable({ token })`.
 */
export function registerProvider<K extends InjectionToken<any, any>>(
  token: K,
  input: ProviderInputFor<K>,
  options?: RegisterProviderOptions,
): K
export function registerProvider<C extends ClassType>(
  target: C,
  input: ProviderInputFor<C>,
  options?: RegisterProviderOptions,
): InjectionToken<ResolvedInstance<C>, any>
export function registerProvider(
  target: InjectionToken<any, any> | ClassType,
  input: ProviderInput<any>,
  options: RegisterProviderOptions = {},
): InjectionToken<any, any> {
  const { token, record } = provide(target as InjectionToken<any, any>, input)
  setDefaultProvider(
    token,
    options.scope === undefined ? record : { ...record, scope: options.scope },
  )
  return token
}
