import type { FactoryContext } from '../internal/context/factory-context.mjs'

import type { StandardSchemaV1 } from './schema.mjs'

export type ClassType = new (...args: any[]) => any
export type ClassTypeWithoutArguments = new () => any
export type ClassTypeWithArgument<Arg> = new (arg: Arg) => any
export type ClassTypeWithOptionalArgument<Arg> = new (arg?: Arg) => any

export type ClassTypeWithInstance<T> = new (...args: any[]) => T
export type ClassTypeWithInstanceAndArgument<T, Arg> = new (arg: Arg) => T
export type ClassTypeWithInstanceAndOptionalArgument<T, Arg> = new (arg?: Arg) => T

export type BaseInjectionTokenSchemaType = StandardSchemaV1

export type OptionalInjectionTokenSchemaType = StandardSchemaV1

export type InjectionTokenSchemaType = StandardSchemaV1

/**
 * Simple hash function for deterministic ID generation
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Generate deterministic ID from token name
 */
function generateTokenId(name: string | symbol | ClassType, customId?: string): string {
  if (customId) {
    return customId
  }

  let base: string
  if (typeof name === 'function') {
    base = `${name.name}_${name.toString()}`
  } else if (typeof name === 'symbol') {
    base = `symbol_${name.toString()}`
  } else {
    base = `token_${name}`
  }

  return `${base.split('_')[0]}_${simpleHash(base)}`
}

export class Token<
  // oxlint-disable-next-line no-unused-vars
  T,
  S extends StandardSchemaV1 | undefined = undefined,
  // Required is always true for any StandardSchemaV1 schema; per-schema
  // optionality detection was dropped in v2 (not expressible generically).
  // oxlint-disable-next-line no-unused-vars
  Required extends boolean = S extends StandardSchemaV1 ? true : false,
> {
  public readonly id: string
  private formattedName: string | null = null

  constructor(
    public readonly name: string | symbol | ClassType,
    public readonly schema: S,
    customId?: string,
  ) {
    this.id = generateTokenId(name, customId)
  }

  static create<T extends ClassType>(name: T): Token<InstanceType<T>, undefined>
  static create<T extends ClassType, Schema extends StandardSchemaV1>(
    name: T,
    schema: Schema,
  ): Token<InstanceType<T>, Schema, true>
  static create<T>(name: string | symbol): Token<T, undefined>
  static create<T, Schema extends StandardSchemaV1>(
    name: string | symbol | ClassType,
    schema: Schema,
  ): Token<T, Schema>
  static create(name: string | symbol, schema?: unknown, customId?: string) {
    // @ts-expect-error
    return new Token(name, schema, customId)
  }

  /**
   * Pre-binds a value to this token, producing a callable bound token.
   *
   * @param value Raw pre-validation input ({@link StandardSchemaV1.InferInput}).
   */
  bind<SS extends StandardSchemaV1>(
    this: Token<T, SS>,
    value: StandardSchemaV1.InferInput<SS>,
  ): BoundToken<T, SS> {
    return new BoundToken(this, value)
  }

  /**
   * Produces a lazily-resolving factory token backed by this token.
   *
   * @param factory Async factory returning raw pre-validation input.
   */
  fromFactory<SS extends StandardSchemaV1>(
    this: Token<T, SS>,
    factory: (ctx: FactoryContext) => Promise<StandardSchemaV1.InferInput<SS>>,
  ): FactoryToken<T, SS> {
    return new FactoryToken(this, factory)
  }

  static bound<T, S extends StandardSchemaV1>(
    token: Token<T, S>,
    value: StandardSchemaV1.InferInput<S>,
  ): BoundToken<T, S> {
    return token.bind(value)
  }

  static factory<T, S extends StandardSchemaV1>(
    token: Token<T, S>,
    factory: (ctx: FactoryContext) => Promise<StandardSchemaV1.InferInput<S>>,
  ): FactoryToken<T, S> {
    return token.fromFactory(factory)
  }

  static refineType<T>(token: BoundToken<any, any>): BoundToken<T, any> {
    return token as BoundToken<T, any>
  }

  toString() {
    if (this.formattedName) {
      return this.formattedName
    }
    const { name } = this
    if (typeof name === 'function') {
      const className = name.name
      this.formattedName = `${className}(${this.id})`
    } else if (typeof name === 'symbol') {
      this.formattedName = `${name.toString()}(${this.id})`
    } else {
      this.formattedName = `${name}(${this.id})`
    }

    return this.formattedName
  }
}

export class BoundToken<T, S extends StandardSchemaV1> {
  public id: string
  public name: string | symbol | ClassType
  public schema: InjectionTokenSchemaType

  constructor(
    public readonly token: Token<T, S>,
    // Raw pre-validation input; the container validates this to
    // InferOutput at resolution time (see token-resolver).
    public readonly value: StandardSchemaV1.InferInput<S>,
  ) {
    this.name = token.name
    this.id = token.id
    this.schema = token.schema as InjectionTokenSchemaType
  }

  toString() {
    return this.token.toString()
  }
}

export class FactoryToken<T, S extends StandardSchemaV1> {
  public value?: StandardSchemaV1.InferInput<S>
  public resolved = false
  public id: string
  public name: string | symbol | ClassType
  public schema: InjectionTokenSchemaType

  constructor(
    public readonly token: Token<T, S>,
    public readonly factory: (ctx: FactoryContext) => Promise<StandardSchemaV1.InferInput<S>>,
  ) {
    this.name = token.name
    this.id = token.id
    this.schema = token.schema as InjectionTokenSchemaType
  }

  // Returns the raw factory output (pre-validation input); the container
  // validates this to InferOutput at resolution time (see token-resolver).
  async resolve(ctx: FactoryContext): Promise<StandardSchemaV1.InferInput<S>> {
    if (!this.resolved) {
      this.value = await this.factory(ctx)
      this.resolved = true
    }
    return this.value as StandardSchemaV1.InferInput<S>
  }

  toString() {
    return this.token.toString()
  }
}

/**
 * @deprecated Use {@link BoundToken} instead. Kept as an alias during the v2
 * migration; will be removed at the end of phase 1.
 */
export const BoundInjectionToken = BoundToken

/**
 * @deprecated Use {@link BoundToken} instead. Kept as an alias during the v2
 * migration; will be removed at the end of phase 1.
 */
export type BoundInjectionToken<T, S extends StandardSchemaV1> = BoundToken<T, S>

/**
 * @deprecated Use {@link FactoryToken} instead. Kept as an alias during the v2
 * migration; will be removed at the end of phase 1.
 */
export const FactoryInjectionToken = FactoryToken

/**
 * @deprecated Use {@link FactoryToken} instead. Kept as an alias during the v2
 * migration; will be removed at the end of phase 1.
 */
export type FactoryInjectionToken<T, S extends StandardSchemaV1> = FactoryToken<T, S>

/**
 * @deprecated Use {@link Token} instead. Kept as an alias during the v2
 * migration; will be removed at the end of phase 1.
 */
export const InjectionToken = Token

/**
 * @deprecated Use {@link Token} instead. Kept as an alias during the v2
 * migration; will be removed at the end of phase 1.
 */
export type InjectionToken<
  T,
  S extends StandardSchemaV1 | undefined = undefined,
  Required extends boolean = S extends StandardSchemaV1 ? true : false,
> = Token<T, S, Required>

export type AnyInjectableType =
  | ClassType
  | Token<any, any>
  | BoundToken<any, any>
  | FactoryToken<any, any>

export type InjectionTokenType = Token<any, any> | BoundToken<any, any> | FactoryToken<any, any>
