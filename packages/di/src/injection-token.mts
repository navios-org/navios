import type { AnyZodObject } from 'zod'

import { randomUUID } from 'crypto'

import { z, ZodOptional } from 'zod'

export type ClassType = new (...args: any[]) => any
export type ClassTypeWithArgument<Arg> = new (arg: Arg) => any

export type ClassTypeWithInstance<T> = new (...args: any[]) => T
export type ClassTypeWithInstanceAndArgument<T, Arg> = new (arg: Arg) => T

export class InjectionToken<
  T,
  S extends AnyZodObject | ZodOptional<AnyZodObject> | unknown = unknown,
> {
  public id = randomUUID()
  private formattedName: string | null = null

  constructor(
    public readonly name: string | symbol | ClassType,
    public readonly schema: AnyZodObject | undefined,
  ) {}

  static create<T extends ClassType>(
    name: T,
  ): InjectionToken<InstanceType<T>, undefined>
  static create<
    T extends ClassType,
    Schema extends AnyZodObject | ZodOptional<AnyZodObject>,
  >(name: T, schema: Schema): InjectionToken<InstanceType<T>, Schema>
  static create<T>(name: string | symbol): InjectionToken<T, undefined>
  static create<T, Schema extends AnyZodObject | ZodOptional<AnyZodObject>>(
    name: string | any,
    schema: Schema,
  ): InjectionToken<T, Schema>
  static create(name: string | symbol, schema?: unknown) {
    // @ts-expect-error
    return new InjectionToken(name, schema)
  }

  static bound<T, S extends AnyZodObject | ZodOptional<AnyZodObject>>(
    token: InjectionToken<T, S>,
    value: z.input<S>,
  ): BoundInjectionToken<T, S> {
    return new BoundInjectionToken(token, value)
  }

  static factory<T, S extends AnyZodObject | ZodOptional<AnyZodObject>>(
    token: InjectionToken<T, S>,
    factory: () => Promise<z.input<S>>,
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

export class BoundInjectionToken<
  T,
  S extends AnyZodObject | ZodOptional<AnyZodObject>,
> {
  public id: string
  public name: string | symbol | ClassType
  public schema: AnyZodObject | ZodOptional<AnyZodObject>

  constructor(
    public readonly token: InjectionToken<T, S>,
    public readonly value: z.input<S>,
  ) {
    this.name = token.name
    this.id = token.id
    this.schema = token.schema as AnyZodObject | ZodOptional<AnyZodObject>
  }

  toString() {
    return this.token.toString()
  }
}

export class FactoryInjectionToken<
  T,
  S extends AnyZodObject | ZodOptional<AnyZodObject>,
> {
  public value?: z.input<S>
  public resolved = false
  public id: string
  public name: string | symbol | ClassType
  public schema: AnyZodObject | ZodOptional<AnyZodObject>

  constructor(
    public readonly token: InjectionToken<T, S>,
    public readonly factory: () => Promise<z.input<S>>,
  ) {
    this.name = token.name
    this.id = token.id
    this.schema = token.schema as AnyZodObject | ZodOptional<AnyZodObject>
  }

  async resolve(): Promise<z.input<S>> {
    if (!this.value) {
      this.value = await this.factory()
      this.resolved = true
    }
    return this.value
  }

  toString() {
    return this.token.toString()
  }
}
