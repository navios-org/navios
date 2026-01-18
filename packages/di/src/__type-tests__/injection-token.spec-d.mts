import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

interface FooService {
  makeFoo(): string
}

const simpleObjectSchema = z.object({
  foo: z.string(),
})
const simpleOptionalObjectSchema = z
  .object({
    foo: z.string(),
  })
  .optional()

test('InjectionToken.create with class', () => {
  class MyService {
    getValue() {
      return 42
    }
  }

  const token = InjectionToken.create(MyService)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<MyService, undefined>>()
})

test('InjectionToken.create with class and schema', () => {
  class MyService {
    constructor(public config: z.infer<typeof simpleObjectSchema>) {}
    getValue() {
      return 42
    }
  }

  const token = InjectionToken.create(MyService, simpleObjectSchema)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<MyService, typeof simpleObjectSchema, true>>()
})

test('InjectionToken.create with class and optional schema', () => {
  class MyService {
    constructor(public config?: z.infer<typeof simpleOptionalObjectSchema>) {}
    getValue() {
      return 42
    }
  }

  const token = InjectionToken.create(MyService, simpleOptionalObjectSchema)
  expectTypeOf(token).toMatchTypeOf<
    InjectionToken<MyService, typeof simpleOptionalObjectSchema, false>
  >()
})

test('InjectionToken.create with string name', () => {
  const token = InjectionToken.create<FooService>('FooService')
  expectTypeOf(token).toMatchTypeOf<InjectionToken<FooService, undefined>>()
})

test('InjectionToken.create with symbol name', () => {
  const token = InjectionToken.create<FooService>(Symbol.for('FooService'))
  expectTypeOf(token).toMatchTypeOf<InjectionToken<FooService, undefined>>()
})

test('InjectionToken.create with string name and schema', () => {
  const token = InjectionToken.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  expectTypeOf(token).toMatchTypeOf<InjectionToken<FooService, typeof simpleObjectSchema>>()
})

test('InjectionToken.bound creates BoundInjectionToken', () => {
  const token = InjectionToken.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const boundToken = InjectionToken.bound(token, { foo: 'bar' })
  expectTypeOf(boundToken).toMatchTypeOf<
    BoundInjectionToken<FooService, typeof simpleObjectSchema>
  >()
})

test('InjectionToken.bound requires correct argument type', () => {
  const token = InjectionToken.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )

  // @ts-expect-error Should fail with wrong argument type
  InjectionToken.bound(token, { wrong: 'key' })

  // @ts-expect-error Should fail with missing required property
  InjectionToken.bound(token, {})
})

test('InjectionToken.factory creates FactoryInjectionToken', () => {
  const token = InjectionToken.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const factoryToken = InjectionToken.factory(token, async () => ({
    foo: 'bar',
  }))
  expectTypeOf(factoryToken).toMatchTypeOf<
    FactoryInjectionToken<FooService, typeof simpleObjectSchema>
  >()
})

test('InjectionToken.factory requires correct return type', () => {
  const token = InjectionToken.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )

  // @ts-expect-error Should fail with wrong return type
  InjectionToken.factory(token, async () => ({ wrong: 'key' }))
})

test('InjectionToken.refineType changes BoundInjectionToken type', () => {
  interface RefinedService {
    doSomething(): void
  }

  const token = InjectionToken.create<unknown, typeof simpleObjectSchema>(
    'Service',
    simpleObjectSchema,
  )
  const boundToken = InjectionToken.bound(token, { foo: 'bar' })
  const refinedToken = InjectionToken.refineType<RefinedService>(boundToken)
  expectTypeOf(refinedToken).toMatchTypeOf<BoundInjectionToken<RefinedService, any>>()
})

test('BoundInjectionToken has value property with correct type', () => {
  const token = InjectionToken.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const boundToken = InjectionToken.bound(token, { foo: 'bar' })

  expectTypeOf(boundToken.value).toMatchTypeOf<{ foo: string }>()
})

test('FactoryInjectionToken has factory property', () => {
  const token = InjectionToken.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const factoryToken = InjectionToken.factory(token, async () => ({
    foo: 'bar',
  }))

  expectTypeOf(factoryToken.factory).toBeFunction()
})

test('InjectionToken properties', () => {
  const token = InjectionToken.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )

  expectTypeOf(token.id).toBeString()
  expectTypeOf(token.name).toMatchTypeOf<string | symbol | (new (...args: any[]) => any)>()
  expectTypeOf(token.toString()).toBeString()
})
