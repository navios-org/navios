import { assertType, describe, test } from 'vitest'
import { z } from 'zod/v4'

import { Injectable } from '../decorators/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { asyncInject } from '../injector.mjs'

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
// const simpleRecordSchema = z.record(z.string(), z.string())
// const simpleOptionalRecordSchema = z.record(z.string(), z.string()).optional()

const typelessObjectToken = InjectionToken.create(
  Symbol.for('Typeless object token'),
  simpleObjectSchema,
)
const typelessOptionalObjectToken = InjectionToken.create(
  Symbol.for('Typeless optional object token'),
  simpleOptionalObjectSchema,
)
// const typelessRecordToken = InjectionToken.create(
//   Symbol.for('Typeless record token'),
//   simpleRecordSchema,
// )
// const typelessOptionalRecordToken = InjectionToken.create(
//   Symbol.for('Typeless optional record token'),
//   simpleOptionalRecordSchema,
// )

const typedObjectToken = InjectionToken.create<
  FooService,
  typeof simpleObjectSchema
>(Symbol.for('Typed object token'), simpleObjectSchema)
const typedOptionalObjectToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalObjectSchema
>(Symbol.for('Typed optional object token'), simpleOptionalObjectSchema)
// const typedRecordToken = InjectionToken.create<
//   FooService,
//   typeof simpleRecordSchema
// >(Symbol.for('Typed record token'), simpleRecordSchema)
// const typedOptionalRecordToken = InjectionToken.create<
//   FooService,
//   typeof simpleOptionalRecordSchema
// >(Symbol.for('Typed optional record token'), simpleOptionalRecordSchema)

const typedToken = InjectionToken.create<FooService>(Symbol.for('Typed token'))

describe('inject', () => {
  describe('#1 Classes', () => {
    test('simple class', async () => {
      @Injectable()
      class Foo {
        makeFoo() {
          return 'foo'
        }
      }

      assertType<Foo>(await asyncInject(Foo))
    })
    test('class with required argument', async () => {
      @Injectable({
        schema: simpleObjectSchema,
      })
      class Foo {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      }

      assertType<Foo>(await asyncInject(Foo, { foo: 'bar' }))
    })
    test('should fail if not compatible', async () => {
      @Injectable({
        schema: simpleObjectSchema,
      })
      class Foo {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      }

      // @ts-expect-error Should fail if not compatible
      await asyncInject(Foo, { test: 'bar' })
    })
  })
  test('#2 Token with required Schema', async () => {
    const result = await asyncInject(typelessObjectToken, { foo: 'bar' })
    assertType<unknown>(result)

    const result2 = await asyncInject(typedObjectToken, { foo: 'bar' })
    assertType<FooService>(result2)

    // @ts-expect-error We show error when we pass the wrong type
    await asyncInject(typedObjectToken, undefined)
  })

  test('#3 Token with optional Schema', async () => {
    const result = await asyncInject(typelessOptionalObjectToken)
    assertType<unknown>(result)

    const result2 = await asyncInject(typedOptionalObjectToken)
    assertType<FooService>(result2)

    const result3 = await asyncInject(typedObjectToken)
    // Special case when we pass the token without args
    // We can only return an error string
    assertType<'Error: Your token requires args: foo'>(result3)
  })

  test('#4 Token with no Schema', async () => {
    const result = await asyncInject(typedToken)
    assertType<FooService>(result)
  })
})
