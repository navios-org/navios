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

  static bound<T, S extends StandardSchemaV1>(
    token: Token<T, S>,
    value: StandardSchemaV1.InferInput<S>,
  ): BoundInjectionToken<T, S> {
    return new BoundInjectionToken(token, value)
  }

  static factory<T, S extends StandardSchemaV1>(
    token: Token<T, S>,
    factory: (ctx: FactoryContext) => Promise<StandardSchemaV1.InferInput<S>>,
  ): FactoryInjectionToken<T, S> {
    return new FactoryInjectionToken(token, factory)
  }

  static refineType<T>(token: BoundInjectionToken<any, any>): BoundInjectionToken<T, any> {
    return token as BoundInjectionToken<T, any>
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

export class BoundInjectionToken<T, S extends StandardSchemaV1> {
  public id: string
  public name: string | symbol | ClassType
  public schema: InjectionTokenSchemaType

  constructor(
    public readonly token: Token<T, S>,
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

export class FactoryInjectionToken<T, S extends StandardSchemaV1> {
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

  async resolve(ctx: FactoryContext): Promise<StandardSchemaV1.InferInput<S>> {
    if (!this.value) {
      this.value = await this.factory(ctx)
      this.resolved = true
    }
    return this.value
  }

  toString() {
    return this.token.toString()
  }
}

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
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>

export type InjectionTokenType =
  | Token<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>
