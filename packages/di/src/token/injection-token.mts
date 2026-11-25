import { isStandardSchema } from '../schema/standard-schema.mjs'

import type { InjectableScope } from '../injectable-scope.mjs'
import type { FactoryContext } from '../provider/factory-context.mjs'
import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { InferInput, StandardSchemaV1 } from '../schema/standard-schema.mjs'

import type { ClassType } from './class-type.mjs'

/**
 * Any Standard Schema can describe a token's args.
 */
export type InjectionTokenSchemaType = StandardSchemaV1

/**
 * `true` when the token's args are required, `false` when the schema accepts
 * `undefined` or the token has no schema.
 */
export type TokenArgsRequired<S> = S extends StandardSchemaV1
  ? undefined extends InferInput<S>
    ? false
    : true
  : false

export interface InjectionTokenOptions<Schema extends StandardSchemaV1 | undefined = undefined> {
  schema?: Schema
  /**
   * Scope of a token that has no provider and is supplied per container with
   * `addInstance` (for example a per-request value).
   */
  scope?: InjectableScope
}

export class InjectionToken<
  // oxlint-disable-next-line no-unused-vars
  T,
  S extends InjectionTokenSchemaType | unknown = unknown,
  // oxlint-disable-next-line no-unused-vars
  Required extends boolean = TokenArgsRequired<S>,
> {
  /**
   * The default provider, set by `@Injectable` / `@Factory`. A container may
   * replace it with `provide()`.
   * @internal
   */
  public provider: ProviderRecord | undefined = undefined
  private formattedName: string | null = null

  constructor(
    public readonly name: string | symbol | ClassType,
    public readonly schema: StandardSchemaV1 | undefined = undefined,
    public readonly scope: InjectableScope | undefined = undefined,
  ) {}

  static create<T extends ClassType>(name: T): InjectionToken<InstanceType<T>, undefined>
  static create<T extends ClassType, Schema extends InjectionTokenSchemaType>(
    name: T,
    schema: Schema,
  ): InjectionToken<InstanceType<T>, Schema>
  static create<T>(name: string | symbol): InjectionToken<T, undefined>
  static create<T>(
    name: string | symbol,
    options: { scope?: InjectableScope; schema?: undefined },
  ): InjectionToken<T, undefined>
  static create<T, Schema extends InjectionTokenSchemaType>(
    name: string | any,
    schema: Schema,
  ): InjectionToken<T, Schema>
  static create<T, Schema extends InjectionTokenSchemaType>(
    name: string | any,
    options: { scope?: InjectableScope; schema: Schema },
  ): InjectionToken<T, Schema>
  static create(
    name: string | symbol | ClassType,
    schemaOrOptions?: StandardSchemaV1 | InjectionTokenOptions<StandardSchemaV1 | undefined>,
  ) {
    if (schemaOrOptions === undefined || isStandardSchema(schemaOrOptions)) {
      return new InjectionToken(name, schemaOrOptions)
    }
    return new InjectionToken(name, schemaOrOptions.schema, schemaOrOptions.scope)
  }

  static bound<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    value: InferInput<S>,
  ): BoundInjectionToken<T, S> {
    return new BoundInjectionToken(token, value)
  }

  static factory<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    factory: (ctx: FactoryContext) => Promise<InferInput<S>> | InferInput<S>,
  ): FactoryInjectionToken<T, S> {
    return new FactoryInjectionToken(token, factory)
  }

  static refineType<T>(token: BoundInjectionToken<any, any>): BoundInjectionToken<T, any> {
    return token as BoundInjectionToken<T, any>
  }

  toString(): string {
    if (this.formattedName !== null) {
      return this.formattedName
    }
    const { name } = this
    this.formattedName =
      typeof name === 'function' ? name.name || 'AnonymousClass' : name.toString()
    return this.formattedName
  }
}

export class BoundInjectionToken<T, S extends InjectionTokenSchemaType> {
  public readonly name: string | symbol | ClassType
  public readonly schema: StandardSchemaV1 | undefined

  constructor(
    public readonly token: InjectionToken<T, S>,
    public readonly value: InferInput<S>,
  ) {
    this.name = token.name
    this.schema = token.schema
  }

  toString(): string {
    return this.token.toString()
  }
}

/**
 * A token whose args are computed by a factory. The factory runs at most once
 * per root container; the value is cached on the container, not on the token.
 */
export class FactoryInjectionToken<T, S extends InjectionTokenSchemaType> {
  public readonly name: string | symbol | ClassType
  public readonly schema: StandardSchemaV1 | undefined

  constructor(
    public readonly token: InjectionToken<T, S>,
    public readonly factory: (ctx: FactoryContext) => Promise<InferInput<S>> | InferInput<S>,
  ) {
    this.name = token.name
    this.schema = token.schema
  }

  toString(): string {
    return this.token.toString()
  }
}

export type AnyInjectableType =
  | ClassType
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>

export type InjectionTokenType =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>
