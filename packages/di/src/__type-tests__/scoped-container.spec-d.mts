import { assertType, describe, test } from 'vitest'
import { z } from 'zod/v4'

import { Container } from '../container/container.mjs'
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

describe('ScopedContainer.get', () => {
  describe('#1 Classes', () => {
    test('simple class', async () => {
      @Injectable()
      class Foo {
        makeFoo() {
          return 'foo'
        }
      }

      const container = new Container()
      const scopedContainer = container.beginRequest('req-1')
      assertType<Foo>(await scopedContainer.get(Foo))
    })

    test('class with required argument', async () => {
      @Injectable({
        schema: simpleObjectSchema,
      })
      class Foo {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      }

      const container = new Container()
      const scopedContainer = container.beginRequest('req-1')
      assertType<Foo>(await scopedContainer.get(Foo, { foo: 'bar' }))
    })

    test('should fail if not compatible', async () => {
      @Injectable({
        schema: simpleObjectSchema,
      })
      class Foo {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      }

      const container = new Container()
      const scopedContainer = container.beginRequest('req-1')
      // @ts-expect-error Should fail if not compatible
      await scopedContainer.get(Foo, { test: 'bar' })
    })

    test('factory class returns unwrapped type', async () => {
      @Factory()
      class FooFactory implements Factorable<string> {
        create() {
          return 'created'
        }
      }

      const container = new Container()
      const scopedContainer = container.beginRequest('req-1')
      // When getting a Factorable class, we get the created type, not the factory
      assertType<string>(await scopedContainer.get(FooFactory))
    })
  })

  test('#2 Token with required Schema', async () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')

    // Typeless token: T is inferred as unknown.
    const result = await scopedContainer.get(typelessObjectToken, {
      foo: 'bar',
    })
    assertType<unknown>(result)

    const result2 = await scopedContainer.get(typedObjectToken, { foo: 'bar' })
    assertType<FooService>(result2)

    // @ts-expect-error We show error when we pass the wrong type
    await scopedContainer.get(typedObjectToken, undefined)
  })

  test('#3 Schema-bearing token resolved without args -> compile error string', async () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')

    // v2: presence of ANY StandardSchemaV1 means args are required. Calling
    // .get() without args resolves to the TokenArgsRequiredError string type
    // (the v1 "optional schema => instance" capability was dropped — see
    // token.mts `Required`). This is the only no-arg result for schema tokens.
    const result = scopedContainer.get(typedObjectToken)
    assertType<'Error: Your token requires args: foo'>(result)
  })

  test('#4 Token with no Schema', async () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')

    const result = await scopedContainer.get(typedToken)
    assertType<FooService>(result)
  })

  test('#5 BoundToken', async () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')

    const boundToken = Token.bound(typedObjectToken, { foo: 'bar' })
    const result = await scopedContainer.get(boundToken)
    assertType<FooService>(result)
  })

  test('#6 FactoryToken', async () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')

    const factoryToken = Token.factory(typedObjectToken, async () => ({
      foo: 'bar',
    }))
    const result = await scopedContainer.get(factoryToken)
    assertType<FooService>(result)
  })
})

describe('ScopedContainer methods', () => {
  test('getRequestId returns string', () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')
    assertType<string>(scopedContainer.getRequestId())
  })

  test('getParent returns Container', () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')
    assertType<Container>(scopedContainer.getParent())
  })

  test('getMetadata returns any', () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1', { userId: '123' })
    assertType<any>(scopedContainer.getMetadata('userId'))
  })

  test('setMetadata accepts any value', () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')
    scopedContainer.setMetadata('userId', '123')
    scopedContainer.setMetadata('count', 42)
    scopedContainer.setMetadata('data', { nested: true })
  })

  test('dispose returns Promise<void>', async () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')
    assertType<Promise<void>>(scopedContainer.dispose())
  })

  test('endRequest returns Promise<void>', async () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')
    assertType<Promise<void>>(scopedContainer.endRequest())
  })

  test('invalidate returns Promise<void>', async () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')
    assertType<Promise<void>>(scopedContainer.invalidate({}))
  })

  test('requestId property is string', () => {
    const container = new Container()
    const scopedContainer = container.beginRequest('req-1')
    assertType<string>(scopedContainer.requestId)
  })
})
