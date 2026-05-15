import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/token.mjs'

import type {
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
  ClassTypeWithOptionalArgument,
} from '../token/token.mjs'

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

test('InjectionToken.create with class that has static fields', () => {
  class ServiceWithStatics {
    static readonly VERSION = '1.0.0'
    static create() {
      return new ServiceWithStatics()
    }

    getValue() {
      return 42
    }
  }

  const token = InjectionToken.create(ServiceWithStatics)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<ServiceWithStatics, undefined>>()
})

test('InjectionToken.create with class that has static fields and schema', () => {
  class ServiceWithStaticsAndSchema {
    static readonly DEFAULT_CONFIG = { foo: 'default' }
    static validate(config: unknown) {
      return typeof config === 'object'
    }

    constructor(public config: z.infer<typeof simpleObjectSchema>) {}

    getValue() {
      return this.config.foo
    }
  }

  const token = InjectionToken.create(ServiceWithStaticsAndSchema, simpleObjectSchema)
  expectTypeOf(token).toMatchTypeOf<
    InjectionToken<ServiceWithStaticsAndSchema, typeof simpleObjectSchema, true>
  >()
})

test('InjectionToken.create with abstract class that has static fields', () => {
  abstract class AbstractServiceWithStatics {
    static readonly SERVICE_NAME = 'AbstractService'

    abstract getValue(): number
  }

  // Abstract classes cannot be used directly with InjectionToken.create
  // because they are not constructible - this is expected behavior
  // @ts-expect-error Abstract classes are not assignable to ClassType
  const _token = InjectionToken.create(AbstractServiceWithStatics)
})

test('InjectionToken.create with class that has static symbol property', () => {
  const BRAND = Symbol('brand')

  class BrandedService {
    static readonly [BRAND] = true
    static readonly metadata = { name: 'BrandedService' }

    doWork() {
      return 'done'
    }
  }

  const token = InjectionToken.create(BrandedService)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<BrandedService, undefined>>()
})

test('InjectionToken.create with class that has static getter/setter', () => {
  class ServiceWithStaticAccessors {
    private static _instance: ServiceWithStaticAccessors | null = null

    static get instance() {
      return this._instance
    }

    static set instance(value: ServiceWithStaticAccessors | null) {
      this._instance = value
    }

    getValue() {
      return 100
    }
  }

  const token = InjectionToken.create(ServiceWithStaticAccessors)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<ServiceWithStaticAccessors, undefined>>()
})

test('InjectionToken.create with class that has private static fields', () => {
  class ServiceWithPrivateStatics {
    static #privateCounter = 0
    private static _secretKey = 'secret'

    static incrementCounter() {
      this.#privateCounter++
    }

    getValue() {
      return 42
    }
  }

  const token = InjectionToken.create(ServiceWithPrivateStatics)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<ServiceWithPrivateStatics, undefined>>()
})

test('ClassType assignability with static fields', () => {
  class ServiceWithStatics {
    static readonly VERSION = '1.0.0'
    static create() {
      return new ServiceWithStatics()
    }
    getValue() {
      return 42
    }
  }

  // Verify that a class with static fields can be assigned to ClassType
  expectTypeOf(ServiceWithStatics).toMatchTypeOf<ClassType>()
})

test('ClassTypeWithInstance assignability with static fields', () => {
  class ServiceWithStatics {
    static readonly VERSION = '1.0.0'
    getValue() {
      return 42
    }
  }

  expectTypeOf(ServiceWithStatics).toMatchTypeOf<ClassTypeWithInstance<ServiceWithStatics>>()
})

test('ClassTypeWithArgument assignability with static fields', () => {
  class ServiceWithStatics {
    static readonly DEFAULT_NAME = 'default'

    constructor(public name: string) {}

    getValue() {
      return this.name
    }
  }

  expectTypeOf(ServiceWithStatics).toMatchTypeOf<ClassTypeWithArgument<string>>()
})

test('ClassTypeWithOptionalArgument assignability with static fields', () => {
  class ServiceWithStatics {
    static readonly DEFAULT_NAME = 'default'

    constructor(public name?: string) {}

    getValue() {
      return this.name ?? ServiceWithStatics.DEFAULT_NAME
    }
  }

  expectTypeOf(ServiceWithStatics).toMatchTypeOf<ClassTypeWithOptionalArgument<string>>()
})

test('ClassTypeWithInstanceAndArgument assignability with static fields', () => {
  interface MyService {
    getValue(): string
  }

  class ServiceWithStatics implements MyService {
    static readonly DEFAULT_NAME = 'default'

    constructor(public name: string) {}

    getValue() {
      return this.name
    }
  }

  expectTypeOf(ServiceWithStatics).toMatchTypeOf<
    ClassTypeWithInstanceAndArgument<MyService, string>
  >()
})

test('ClassType with generic static methods', () => {
  class ServiceWithGenericStatics {
    static create<T>(_value: T): ServiceWithGenericStatics {
      return new ServiceWithGenericStatics()
    }

    static fromArray<T>(_values: T[]): ServiceWithGenericStatics {
      return new ServiceWithGenericStatics()
    }

    getValue() {
      return 42
    }
  }

  const token = InjectionToken.create(ServiceWithGenericStatics)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<ServiceWithGenericStatics, undefined>>()
  expectTypeOf(ServiceWithGenericStatics).toMatchTypeOf<ClassType>()
})

test('ClassType with static async methods', () => {
  class ServiceWithAsyncStatics {
    static async initialize(): Promise<ServiceWithAsyncStatics> {
      return new ServiceWithAsyncStatics()
    }

    static async fetch<T>(_url: string): Promise<T> {
      return {} as T
    }

    getValue() {
      return 42
    }
  }

  const token = InjectionToken.create(ServiceWithAsyncStatics)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<ServiceWithAsyncStatics, undefined>>()
  expectTypeOf(ServiceWithAsyncStatics).toMatchTypeOf<ClassType>()
})

test('ClassType with static field that is a class itself', () => {
  class InnerClass {
    value = 10
  }

  class OuterService {
    static Inner = InnerClass
    static instances: OuterService[] = []

    getValue() {
      return new OuterService.Inner().value
    }
  }

  const token = InjectionToken.create(OuterService)
  expectTypeOf(token).toMatchTypeOf<InjectionToken<OuterService, undefined>>()
  expectTypeOf(OuterService).toMatchTypeOf<ClassType>()
})

test('ClassType with inherited static fields', () => {
  class BaseService {
    static readonly BASE_VERSION = '1.0.0'
    static baseMethod() {
      return 'base'
    }

    baseValue() {
      return 'base'
    }
  }

  class DerivedService extends BaseService {
    static readonly DERIVED_VERSION = '2.0.0'
    static derivedMethod() {
      return 'derived'
    }

    derivedValue() {
      return 'derived'
    }
  }

  const baseToken = InjectionToken.create(BaseService)
  const derivedToken = InjectionToken.create(DerivedService)

  expectTypeOf(baseToken).toMatchTypeOf<InjectionToken<BaseService, undefined>>()
  expectTypeOf(derivedToken).toMatchTypeOf<InjectionToken<DerivedService, undefined>>()
  expectTypeOf(BaseService).toMatchTypeOf<ClassType>()
  expectTypeOf(DerivedService).toMatchTypeOf<ClassType>()
})
