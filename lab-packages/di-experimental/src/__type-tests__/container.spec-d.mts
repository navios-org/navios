import { assertType, describe, test } from 'vitest'
import { z } from 'zod/v4'

import type { Factorable } from '../interfaces/index.mjs'

import { Container } from '../container/container.mjs'
import { ScopedContainer } from '../container/scoped-container.mjs'
import { Injectable, Factory } from '../decorators/index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

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

const typelessObjectToken = InjectionToken.create(
  Symbol.for('Typeless object token'),
  simpleObjectSchema,
)
const typelessOptionalObjectToken = InjectionToken.create(
  Symbol.for('Typeless optional object token'),
  simpleOptionalObjectSchema,
)

const typedObjectToken = InjectionToken.create<
  FooService,
  typeof simpleObjectSchema
>(Symbol.for('Typed object token'), simpleObjectSchema)
const typedOptionalObjectToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalObjectSchema
>(Symbol.for('Typed optional object token'), simpleOptionalObjectSchema)

const typedToken = InjectionToken.create<FooService>(Symbol.for('Typed token'))

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

    const result = await container.get(typelessObjectToken, { foo: 'bar' })
    assertType<unknown>(result)

    const result2 = await container.get(typedObjectToken, { foo: 'bar' })
    assertType<FooService>(result2)

    // @ts-expect-error We show error when we pass the wrong type
    await container.get(typedObjectToken, undefined)
  })

  test('#3 Token with optional Schema', async () => {
    const container = new Container()

    const result = await container.get(typelessOptionalObjectToken)
    assertType<unknown>(result)

    const result2 = await container.get(typedOptionalObjectToken)
    assertType<FooService>(result2)

    const result3 = await container.get(typedObjectToken)
    // Special case when we pass the token without args
    // We can only return an error string
    assertType<'Error: Your token requires args: foo'>(result3)
  })

  test('#4 Token with no Schema', async () => {
    const container = new Container()

    const result = await container.get(typedToken)
    assertType<FooService>(result)
  })

  test('#5 BoundInjectionToken', async () => {
    const container = new Container()

    const boundToken = InjectionToken.bound(typedObjectToken, { foo: 'bar' })
    const result = await container.get(boundToken)
    assertType<FooService>(result)
  })

  test('#6 FactoryInjectionToken', async () => {
    const container = new Container()

    const factoryToken = InjectionToken.factory(
      typedObjectToken,
      async () => ({ foo: 'bar' }),
    )
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
