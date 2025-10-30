import type { z, ZodObject, ZodOptional, ZodRecord } from 'zod/v4'

import type { FactoryContext } from './factory-context.mjs'

export type ClassType = new (...args: any[]) => any
export type ClassTypeWithoutArguments = new () => any
export type ClassTypeWithArgument<Arg> = new (arg: Arg) => any
export type ClassTypeWithOptionalArgument<Arg> = new (arg?: Arg) => any

export type ClassTypeWithInstance<T> = new (...args: any[]) => T
export type ClassTypeWithInstanceAndArgument<T, Arg> = new (arg: Arg) => T
export type ClassTypeWithInstanceAndOptionalArgument<T, Arg> = new (
  arg?: Arg,
) => T

export type BaseInjectionTokenSchemaType = ZodObject | ZodRecord

export type OptionalInjectionTokenSchemaType =
  | ZodOptional<ZodObject>
  | ZodOptional<ZodRecord>

export type InjectionTokenSchemaType =
  | BaseInjectionTokenSchemaType
  | OptionalInjectionTokenSchemaType

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
  public id = globalThis.crypto.randomUUID()
  private formattedName: string | null = null

  constructor(
    public readonly name: string | symbol | ClassType,
    public readonly schema: ZodObject | undefined,
  ) {}

  static create<T extends ClassType>(
    name: T,
  ): InjectionToken<InstanceType<T>, undefined>
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
  static create(name: string | symbol, schema?: unknown) {
    // @ts-expect-error
    return new InjectionToken(name, schema)
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

  static refineType<T>(
    token: BoundInjectionToken<any, any>,
  ): BoundInjectionToken<T, any> {
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
