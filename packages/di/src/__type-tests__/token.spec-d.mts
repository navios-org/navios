import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { BoundToken, FactoryToken, Token } from '../token/token.mjs'

import type {
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
} from '../token/token.mjs'

interface FooService {
  makeFoo(): string
}

const simpleObjectSchema = z.object({
  foo: z.string(),
})

test('Token.create with class', () => {
  class MyService {
    getValue() {
      return 42
    }
  }

  const token = Token.create(MyService)
  expectTypeOf(token).toMatchTypeOf<Token<MyService, undefined>>()
})

test('Token.create with class and schema', () => {
  class MyService {
    constructor(public config: z.infer<typeof simpleObjectSchema>) {}
    getValue() {
      return 42
    }
  }

  const token = Token.create(MyService, simpleObjectSchema)
  // v2: any StandardSchemaV1 implies Required=true (the v1 "optional schema"
  // branch was dropped — see token.mts `Required`).
  expectTypeOf(token).toMatchTypeOf<Token<MyService, typeof simpleObjectSchema, true>>()
})

test('Token.create with string name', () => {
  const token = Token.create<FooService>('FooService')
  expectTypeOf(token).toMatchTypeOf<Token<FooService, undefined>>()
})

test('Token.create with symbol name', () => {
  const token = Token.create<FooService>(Symbol.for('FooService'))
  expectTypeOf(token).toMatchTypeOf<Token<FooService, undefined>>()
})

test('Token.create with string name and schema', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  expectTypeOf(token).toMatchTypeOf<Token<FooService, typeof simpleObjectSchema>>()
})

test('token.bind() creates a BoundToken', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const boundToken = token.bind({ foo: 'bar' })
  expectTypeOf(boundToken).toMatchTypeOf<BoundToken<FooService, typeof simpleObjectSchema>>()
})

test('Token.bound creates a BoundToken', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const boundToken = Token.bound(token, { foo: 'bar' })
  expectTypeOf(boundToken).toMatchTypeOf<BoundToken<FooService, typeof simpleObjectSchema>>()
})

test('token.bind() requires correct argument type', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )

  // @ts-expect-error Should fail with wrong argument type
  token.bind({ wrong: 'key' })

  // @ts-expect-error Should fail with missing required property
  token.bind({})
})

test('token.fromFactory() creates a FactoryToken', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const factoryToken = token.fromFactory(async () => ({ foo: 'bar' }))
  expectTypeOf(factoryToken).toMatchTypeOf<FactoryToken<FooService, typeof simpleObjectSchema>>()
})

test('Token.factory creates a FactoryToken', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const factoryToken = Token.factory(token, async () => ({ foo: 'bar' }))
  expectTypeOf(factoryToken).toMatchTypeOf<FactoryToken<FooService, typeof simpleObjectSchema>>()
})

test('token.fromFactory() requires correct return type', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )

  // @ts-expect-error Should fail with wrong return type
  token.fromFactory(async () => ({ wrong: 'key' }))
})

test('Token.refineType changes BoundToken type', () => {
  interface RefinedService {
    doSomething(): void
  }

  const token = Token.create<unknown, typeof simpleObjectSchema>('Service', simpleObjectSchema)
  const boundToken = token.bind({ foo: 'bar' })
  const refinedToken = Token.refineType<RefinedService>(boundToken)
  expectTypeOf(refinedToken).toMatchTypeOf<BoundToken<RefinedService, any>>()
})

test('BoundToken has value property with correct type', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const boundToken = token.bind({ foo: 'bar' })

  expectTypeOf(boundToken.value).toEqualTypeOf<{ foo: string }>()
})

test('FactoryToken has factory property', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )
  const factoryToken = token.fromFactory(async () => ({ foo: 'bar' }))

  expectTypeOf(factoryToken.factory).toBeFunction()
})

test('Token properties', () => {
  const token = Token.create<FooService, typeof simpleObjectSchema>(
    'FooService',
    simpleObjectSchema,
  )

  expectTypeOf(token.id).toBeString()
  expectTypeOf(token.name).toMatchTypeOf<string | symbol | (new (...args: any[]) => any)>()
  expectTypeOf(token.toString()).toBeString()
})

test('Token.create with class that has static fields', () => {
  class ServiceWithStatics {
    static readonly VERSION = '1.0.0'
    static create() {
      return new ServiceWithStatics()
    }

    getValue() {
      return 42
    }
  }

  const token = Token.create(ServiceWithStatics)
  expectTypeOf(token).toMatchTypeOf<Token<ServiceWithStatics, undefined>>()
})

test('Token.create with class that has static fields and schema', () => {
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

  const token = Token.create(ServiceWithStaticsAndSchema, simpleObjectSchema)
  expectTypeOf(token).toMatchTypeOf<
    Token<ServiceWithStaticsAndSchema, typeof simpleObjectSchema, true>
  >()
})

test('Token.create with abstract class that has static fields', () => {
  abstract class AbstractServiceWithStatics {
    static readonly SERVICE_NAME = 'AbstractService'

    abstract getValue(): number
  }

  // Abstract classes cannot be used directly with Token.create
  // because they are not constructible - this is expected behavior
  // @ts-expect-error Abstract classes are not assignable to ClassType
  const _token = Token.create(AbstractServiceWithStatics)
})

test('Token.create with class that has static symbol property', () => {
  const BRAND = Symbol('brand')

  class BrandedService {
    static readonly [BRAND] = true
    static readonly metadata = { name: 'BrandedService' }

    doWork() {
      return 'done'
    }
  }

  const token = Token.create(BrandedService)
  expectTypeOf(token).toMatchTypeOf<Token<BrandedService, undefined>>()
})

test('Token.create with class that has static getter/setter', () => {
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

  const token = Token.create(ServiceWithStaticAccessors)
  expectTypeOf(token).toMatchTypeOf<Token<ServiceWithStaticAccessors, undefined>>()
})

test('Token.create with class that has private static fields', () => {
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

  const token = Token.create(ServiceWithPrivateStatics)
  expectTypeOf(token).toMatchTypeOf<Token<ServiceWithPrivateStatics, undefined>>()
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

  const token = Token.create(ServiceWithGenericStatics)
  expectTypeOf(token).toMatchTypeOf<Token<ServiceWithGenericStatics, undefined>>()
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

  const token = Token.create(ServiceWithAsyncStatics)
  expectTypeOf(token).toMatchTypeOf<Token<ServiceWithAsyncStatics, undefined>>()
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

  const token = Token.create(OuterService)
  expectTypeOf(token).toMatchTypeOf<Token<OuterService, undefined>>()
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

  const baseToken = Token.create(BaseService)
  const derivedToken = Token.create(DerivedService)

  expectTypeOf(baseToken).toMatchTypeOf<Token<BaseService, undefined>>()
  expectTypeOf(derivedToken).toMatchTypeOf<Token<DerivedService, undefined>>()
  expectTypeOf(BaseService).toMatchTypeOf<ClassType>()
  expectTypeOf(DerivedService).toMatchTypeOf<ClassType>()
})
