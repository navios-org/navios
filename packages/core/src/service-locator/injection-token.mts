import type { AnyZodObject } from 'zod'

import { randomUUID } from 'crypto'

import { z, ZodOptional } from 'zod'

export type ClassType = new (...args: any[]) => any

export type ClassTypeWithInstance<T> = new (...args: any[]) => T

export class InjectionToken<
  T,
  S extends AnyZodObject | ZodOptional<AnyZodObject> | unknown = unknown,
> {
  public id = randomUUID()
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

  static refineType<T>(
    token: BoundInjectionToken<any, any>,
  ): BoundInjectionToken<T, any> {
    return token as BoundInjectionToken<T, any>
  }

  get value(): S extends AnyZodObject | ZodOptional<AnyZodObject>
    ? z.input<S>
    : undefined {
    if (this.schema) {
      const value = this.schema.safeParse(undefined)
      if (value.success) {
        // @ts-expect-error We don't need to check the schema here
        return value.data
      } else {
        throw new Error('Cannot access value of an unbound token')
      }
    }
    // @ts-expect-error We don't need to check the schema here
    return undefined
  }
}

export class BoundInjectionToken<
  T,
  S extends AnyZodObject | ZodOptional<AnyZodObject>,
> extends InjectionToken<T, undefined> {
  constructor(
    public readonly token: InjectionToken<T, S>,
    private readonly _value: z.input<S>,
  ) {
    super(token.name, token.schema)
    this.id = token.id
  }

  override get value(): any {
    return this._value
  }
}
