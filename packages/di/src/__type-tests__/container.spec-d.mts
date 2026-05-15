import { assertType, describe, test } from 'vitest'
import { z } from 'zod/v4'

import { Container } from '../container/container.mjs'
import { ScopedContainer } from '../container/scoped-container.mjs'
import { Factory, Injectable } from '../decorators/index.mjs'
import { Token } from '../token/token.mjs'

import type { Factorable } from '../interfaces/index.mjs'

interface FooService {
  makeFoo(): string
}

const simpleObjectSchema = z.object({
  foo: z.string(),
})

const typelessObjectToken = Token.create(Symbol.for('Typeless object token'), simpleObjectSchema)

const typedObjectToken = Token.create<FooService, typeof simpleObjectSchema>(
  Symbol.for('Typed object token'),
  simpleObjectSchema,
)

const typedToken = Token.create<FooService>(Symbol.for('Typed token'))

describe('Container.get', () => {
  describe('#1 Classes', () => {
    test('simple class', async () => {
      @Injectable()
      class Foo {
        makeFoo() {
          return 'foo'
        }
      }

      const container = new Container()
      assertType<Foo>(await container.get(Foo))
    })

    test('class with required argument', async () => {
      @Injectable({
        schema: simpleObjectSchema,
      })
      class Foo {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      }

      const container = new Container()
      assertType<Foo>(await container.get(Foo, { foo: 'bar' }))
    })

    test('should fail if not compatible', async () => {
      @Injectable({
        schema: simpleObjectSchema,
      })
      class Foo {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      }

      const container = new Container()
      // @ts-expect-error Should fail if not compatible
      await container.get(Foo, { test: 'bar' })
    })

    test('factory class returns unwrapped type', async () => {
      @Factory()
      class FooFactory implements Factorable<string> {
        create() {
          return 'created'
        }
      }

      const container = new Container()
      // When getting a Factorable class, we get the created type, not the factory
      assertType<string>(await container.get(FooFactory))
    })
  })

  test('#2 Token with required Schema', async () => {
    const container = new Container()

    // Typeless token: T is inferred as unknown.
    const result = await container.get(typelessObjectToken, { foo: 'bar' })
    assertType<unknown>(result)

    const result2 = await container.get(typedObjectToken, { foo: 'bar' })
    assertType<FooService>(result2)

    // @ts-expect-error We show error when we pass the wrong type
    await container.get(typedObjectToken, undefined)
  })

  test('#3 Schema-bearing token resolved without args -> compile error string', async () => {
    const container = new Container()

    // v2: presence of ANY StandardSchemaV1 means args are required. Calling
    // .get() without args resolves to the TokenArgsRequiredError string type
    // (the v1 "optional schema => instance" capability was dropped — see
    // token.mts `Required`). This is the only no-arg result for schema tokens.
    const result = container.get(typedObjectToken)
    assertType<'Error: Your token requires args: foo'>(result)
  })

  test('#4 Token with no Schema', async () => {
    const container = new Container()

    const result = await container.get(typedToken)
    assertType<FooService>(result)
  })

  test('#5 BoundToken', async () => {
    const container = new Container()

    const boundToken = Token.bound(typedObjectToken, { foo: 'bar' })
    const result = await container.get(boundToken)
    assertType<FooService>(result)
  })

  test('#6 FactoryToken', async () => {
    const container = new Container()

    const factoryToken = Token.factory(typedObjectToken, async () => ({ foo: 'bar' }))
    const result = await container.get(factoryToken)
    assertType<FooService>(result)
  })
})

describe('Container methods', () => {
  test('beginRequest returns ScopedContainer', () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('request-1')
    assertType<ScopedContainer>(scopedContainer)
  })

  test('getActiveRequestIds returns ReadonlySet<string>', () => {
    const container = new Container()
    const activeIds = container.getActiveRequestIds()
    assertType<ReadonlySet<string>>(activeIds)
  })

  test('hasActiveRequest returns boolean', () => {
    const container = new Container()
    const hasRequest = container.hasActiveRequest('request-1')
    assertType<boolean>(hasRequest)
  })

  test('dispose returns Promise<void>', async () => {
    const container = new Container()
    assertType<Promise<void>>(container.dispose())
  })

  test('invalidate returns Promise<void>', async () => {
    const container = new Container()
    assertType<Promise<void>>(container.invalidate({}))
  })
})
