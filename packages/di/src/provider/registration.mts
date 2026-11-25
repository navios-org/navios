import { DIError } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { InjectableTokenMeta } from '../token/injectable-token.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

import type { StandardSchemaV1 } from '../schema/standard-schema.mjs'
import type { ClassType } from '../token/class-type.mjs'

import { createRecord } from './provider-record.mjs'

import type { ProviderRecord } from './provider-record.mjs'

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
