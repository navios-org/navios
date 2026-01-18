import type { z, ZodObject, ZodOptional, ZodRecord } from 'zod/v4'

import type { FactoryContext } from '../internal/context/factory-context.mjs'

export type ClassType = new (...args: any[]) => any
export type ClassTypeWithoutArguments = new () => any
export type ClassTypeWithArgument<Arg> = new (arg: Arg) => any
export type ClassTypeWithOptionalArgument<Arg> = new (arg?: Arg) => any

export type ClassTypeWithInstance<T> = new (...args: any[]) => T
export type ClassTypeWithInstanceAndArgument<T, Arg> = new (arg: Arg) => T
export type ClassTypeWithInstanceAndOptionalArgument<T, Arg> = new (arg?: Arg) => T

export type BaseInjectionTokenSchemaType = ZodObject | ZodRecord

export type OptionalInjectionTokenSchemaType = ZodOptional<ZodObject> | ZodOptional<ZodRecord>

export type InjectionTokenSchemaType =
  | BaseInjectionTokenSchemaType
  | OptionalInjectionTokenSchemaType

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

export class InjectionToken<
  // oxlint-disable-next-line no-unused-vars
  T,
  S extends InjectionTokenSchemaType | unknown = unknown,
  // oxlint-disable-next-line no-unused-vars
  Required extends boolean = S extends ZodOptional<ZodObject>
    ? false
    : S extends ZodOptional<ZodRecord>
      ? false
      : S extends ZodObject
        ? true
        : S extends ZodRecord
          ? true
          : false,
> {
  public readonly id: string
  private formattedName: string | null = null

  constructor(
    public readonly name: string | symbol | ClassType,
    public readonly schema: ZodObject | undefined,
    customId?: string,
  ) {
    this.id = generateTokenId(name, customId)
  }

  static create<T extends ClassType>(name: T): InjectionToken<InstanceType<T>, undefined>
  static create<T extends ClassType, Schema extends InjectionTokenSchemaType>(
    name: T,
    schema: Schema,
  ): Schema['_def']['type'] extends 'ZodOptional'
    ? InjectionToken<InstanceType<T>, Schema, false>
    : InjectionToken<InstanceType<T>, Schema, true>
  static create<T>(name: string | symbol): InjectionToken<T, undefined>
  static create<T, Schema extends InjectionTokenSchemaType>(
    name: string | any,
    schema: Schema,
  ): InjectionToken<T, Schema>
  static create(name: string | symbol, schema?: unknown, customId?: string) {
    // @ts-expect-error
    return new InjectionToken(name, schema, customId)
  }

  static bound<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    value: z.input<S>,
  ): BoundInjectionToken<T, S> {
    return new BoundInjectionToken(token, value)
  }

  static factory<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    factory: (ctx: FactoryContext) => Promise<z.input<S>>,
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

export class BoundInjectionToken<T, S extends InjectionTokenSchemaType> {
  public id: string
  public name: string | symbol | ClassType
  public schema: InjectionTokenSchemaType

  constructor(
    public readonly token: InjectionToken<T, S>,
    public readonly value: z.input<S>,
  ) {
    this.name = token.name
    this.id = token.id
    this.schema = token.schema as InjectionTokenSchemaType
  }

  toString() {
    return this.token.toString()
  }
}

export class FactoryInjectionToken<T, S extends InjectionTokenSchemaType> {
  public value?: z.input<S>
  public resolved = false
  public id: string
  public name: string | symbol | ClassType
  public schema: InjectionTokenSchemaType

  constructor(
    public readonly token: InjectionToken<T, S>,
    public readonly factory: (ctx: FactoryContext) => Promise<z.input<S>>,
  ) {
    this.name = token.name
    this.id = token.id
    this.schema = token.schema as InjectionTokenSchemaType
  }

  async resolve(ctx: FactoryContext): Promise<z.input<S>> {
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

export type AnyInjectableType =
  | ClassType
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>

export type InjectionTokenType =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>
