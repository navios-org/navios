import type { AnyZodObject } from 'zod'

import { randomUUID } from 'crypto'

export type ClassType = new (...args: any[]) => any

export type ClassTypeWithInstance<T> = new (...args: any[]) => T

export class InjectionToken<T, S extends AnyZodObject | unknown = unknown> {
  public id = randomUUID()
  constructor(
    public readonly name: string | symbol | ClassType,
    public readonly schema: AnyZodObject | undefined,
  ) {}

  static create<T extends ClassType>(
    name: T,
  ): InjectionToken<InstanceType<T>, undefined>
  static create<T extends ClassType, Schema extends AnyZodObject>(
    name: T,
    schema: Schema,
  ): InjectionToken<InstanceType<T>, Schema>
  static create<T>(name: string): InjectionToken<T, undefined>
  static create<T, Schema extends AnyZodObject>(
    name: string,
    schema: Schema,
  ): InjectionToken<T, Schema>
  static create(name: string, schema?: unknown) {
    // @ts-expect-error
    return new InjectionToken(name, schema)
  }

  toString() {
    return this.name
  }
}
