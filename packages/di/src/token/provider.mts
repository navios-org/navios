import { InjectableScope } from '../enums/index.mjs'
import { DIError } from '../errors/di-error.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'

import type { StandardSchemaV1 } from '../schema/standard-schema.mjs'

import { InjectionToken } from './injection-token.mjs'

import type { ClassType, FactoryContext } from './injection-token.mjs'

export type ProviderKind = 'class' | 'factory' | 'function' | 'value'

/**
 * One request made by a class while it was being constructed.
 * @internal
 */
export interface PlanEntry {
  token: InjectionToken<any, any>
  args: unknown
}

/**
 * How to produce the value for a token.
 */
export interface ProviderRecord {
  token: InjectionToken<any, any>
  kind: ProviderKind
  /** `class`: the class to instantiate. `factory`: the `@Factory` class. */
  target: ClassType | undefined
  /** `function`: called with the factory context and the validated args. */
  fn: ((ctx: FactoryContext, args: any) => unknown) | undefined
  /** `value`: the value itself. */
  value: unknown
  scope: InjectableScope
  /**
   * Requests made during the first successful construction, in order.
   * `null` until then.
   * @internal
   */
  plan: PlanEntry[] | null
  /**
   * Set once a construction pass of this provider had to be discarded because
   * a dependency was not ready; later builds resolve the plan up front.
   * @internal
   */
  preResolve?: boolean
}

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

function createRecord(
  token: InjectionToken<any, any>,
  kind: ProviderKind,
  scope: InjectableScope,
  target: ClassType | undefined,
  fn: ProviderRecord['fn'],
  value: unknown,
): ProviderRecord {
  return { token, kind, target, fn, value, scope, plan: null }
}

/**
 * Returns the token attached to a class by `@Injectable` / `@Factory`, or
 * `undefined` when the class is not registered.
 */
export function findInjectableToken(target: ClassType): InjectionToken<any, any> | undefined {
  return Object.prototype.hasOwnProperty.call(target, InjectableTokenMeta)
    ? ((target as any)[InjectableTokenMeta] as InjectionToken<any, any>)
    : undefined
}

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

function setDefaultProvider(token: InjectionToken<any, any>, record: ProviderRecord): void {
  const existing = token.provider
  if (
    existing &&
    existing.target !== record.target &&
    existing.target?.name !== record.target?.name
  ) {
    throw DIError.providerConflict(
      token.toString(),
      existing.target?.name ?? existing.kind,
      record.target?.name ?? record.kind,
    )
  }
  // Same class name: the module was evaluated again (hot reload, or a test
  // that redefines the class). The newest definition wins.
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
    throw new Error('[DI] @Injectable decorator cannot have both a token and a schema')
  }
  const injectableToken = token ?? new InjectionToken(target, schema)
  setDefaultProvider(
    injectableToken,
    createRecord(injectableToken, 'class', scope, target, undefined, undefined),
  )
  Object.defineProperty(target, InjectableTokenMeta, {
    value: injectableToken,
    configurable: true,
    enumerable: false,
    writable: true,
  })
  return injectableToken
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
  const injectableToken = token ?? new InjectionToken(target)
  setDefaultProvider(
    injectableToken,
    createRecord(injectableToken, 'factory', scope, target, undefined, undefined),
  )
  Object.defineProperty(target, InjectableTokenMeta, {
    value: injectableToken,
    configurable: true,
    enumerable: false,
    writable: true,
  })
  return injectableToken
}
