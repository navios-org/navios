import { assertType, describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { Factory, Injectable } from '../decorators/index.mjs'
import { asyncInject, inject, optional } from '../injection/injectors.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

import type { Factorable } from '../provider/factorable.mjs'
import type { StandardSchemaV1 } from '../schema/standard-schema.mjs'

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

const typedObjectToken = InjectionToken.create<FooService, typeof simpleObjectSchema>(
  Symbol.for('Typed object token'),
  simpleObjectSchema,
)
const typedOptionalObjectToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalObjectSchema
>(Symbol.for('Typed optional object token'), simpleOptionalObjectSchema)

const typedToken = InjectionToken.create<FooService>(Symbol.for('Typed token'))

describe('asyncInject', () => {
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

describe('inject (synchronous)', () => {
  describe('#1 Classes', () => {
    test('simple class', () => {
      @Injectable()
      class Foo {
        makeFoo() {
          return 'foo'
        }
      }

      assertType<Foo>(inject(Foo))
    })

    test('class with required argument', () => {
      @Injectable({
        schema: simpleObjectSchema,
      })
      class Foo {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      }

      assertType<Foo>(inject(Foo, { foo: 'bar' }))
    })

    test('should fail if not compatible', () => {
      @Injectable({
        schema: simpleObjectSchema,
      })
      class Foo {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      }

      // @ts-expect-error Should fail if not compatible
      inject(Foo, { test: 'bar' })
    })
  })

  test('#2 Token with required Schema', () => {
    const result = inject(typelessObjectToken, { foo: 'bar' })
    assertType<unknown>(result)

    const result2 = inject(typedObjectToken, { foo: 'bar' })
    assertType<FooService>(result2)

    // @ts-expect-error We show error when we pass the wrong type
    inject(typedObjectToken, undefined)
  })

  test('#3 Token with optional Schema', () => {
    const result = inject(typelessOptionalObjectToken)
    assertType<unknown>(result)

    const result2 = inject(typedOptionalObjectToken)
    assertType<FooService>(result2)

    const result3 = inject(typedObjectToken)
    // Special case when we pass the token without args
    // We can only return an error string
    assertType<'Error: Your token requires args: foo'>(result3)
  })

  test('#4 Token with no Schema', () => {
    const result = inject(typedToken)
    assertType<FooService>(result)
  })
})

describe('optional', () => {
  describe('#1 Classes', () => {
    test('simple class returns nullable type', () => {
      @Injectable()
      class Foo {
        makeFoo() {
          return 'foo'
        }
      }

      assertType<Foo | null>(optional(Foo))
    })

    // Note: optional() does not have a class + args overload
    // Classes with required args should use tokens instead
  })

  test('#2 Token with required Schema', () => {
    const result = optional(typelessObjectToken, { foo: 'bar' })
    assertType<unknown>(result)

    const result2 = optional(typedObjectToken, { foo: 'bar' })
    assertType<FooService | null>(result2)
  })

  test('#3 Token with optional Schema', () => {
    const result = optional(typelessOptionalObjectToken)
    assertType<unknown>(result)

    const result2 = optional(typedOptionalObjectToken)
    assertType<FooService | null>(result2)

    const result3 = optional(typedObjectToken)
    // Special case when we pass the token without args
    assertType<'Error: Your token requires args: foo'>(result3)
  })

  test('#4 Token with no Schema', () => {
    const result = optional(typedToken)
    assertType<FooService | null>(result)
  })
})

describe('factory classes', () => {
  test('resolve to the created type', async () => {
    @Factory()
    class SyncFactory implements Factorable<string> {
      create() {
        return 'created'
      }
    }

    @Factory()
    class AsyncFactory implements Factorable<number> {
      async create() {
        return 42
      }
    }

    expectTypeOf(inject(SyncFactory)).toEqualTypeOf<string>()
    expectTypeOf(inject(AsyncFactory)).toEqualTypeOf<number>()
    expectTypeOf(asyncInject(SyncFactory)).toEqualTypeOf<Promise<string>>()
    expectTypeOf(asyncInject(AsyncFactory)).toEqualTypeOf<Promise<number>>()
    expectTypeOf(optional(SyncFactory)).toEqualTypeOf<string | null>()
  })
})

describe('schemas whose input and output differ', () => {
  const transformSchema = z.object({ foo: z.string() }).transform((value) => ({
    length: value.foo.length,
  }))
  const transformToken = InjectionToken.create<FooService, typeof transformSchema>(
    Symbol.for('Transform token'),
    transformSchema,
  )

  test('call sites take the schema input', () => {
    expectTypeOf(inject(transformToken, { foo: 'bar' })).toEqualTypeOf<FooService>()
    expectTypeOf(asyncInject(transformToken, { foo: 'bar' })).toEqualTypeOf<Promise<FooService>>()
    expectTypeOf(optional(transformToken, { foo: 'bar' })).toEqualTypeOf<FooService | null>()

    // @ts-expect-error the schema output is not accepted as args
    inject(transformToken, { length: 3 })
    // @ts-expect-error the schema output is not accepted as args
    void asyncInject(transformToken, { length: 3 })
  })
})

describe('Standard Schema that is not zod', () => {
  const requiredSchema = {} as StandardSchemaV1<{ id: string }, { id: number }>
  const optionalSchema = {} as StandardSchemaV1<{ id: string } | undefined, { id: number }>
  const requiredToken = InjectionToken.create<FooService, typeof requiredSchema>(
    Symbol.for('Standard required'),
    requiredSchema,
  )
  const optionalToken = InjectionToken.create<FooService, typeof optionalSchema>(
    Symbol.for('Standard optional'),
    optionalSchema,
  )

  test('required args', () => {
    expectTypeOf(inject(requiredToken, { id: 'a' })).toEqualTypeOf<FooService>()
    expectTypeOf(inject(requiredToken)).toEqualTypeOf<'Error: Your token requires args: id'>()

    // @ts-expect-error args must match the schema input
    inject(requiredToken, { id: 1 })
  })

  test('optional args', () => {
    expectTypeOf(inject(optionalToken)).toEqualTypeOf<FooService>()
    expectTypeOf(inject(optionalToken, { id: 'a' })).toEqualTypeOf<FooService>()
  })
})
