import { assertType, describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod'

import { Injectable } from '../decorators/index.mjs'
import { InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { inject } from '../injector.mjs'

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
const simpleRecordSchema = z.record(z.string())
const simpleOptionalRecordSchema = z.record(z.string()).optional()

const typelessObjectToken = InjectionToken.create(
  Symbol.for('Typeless object token'),
  simpleObjectSchema,
)
const typelessOptionalObjectToken = InjectionToken.create(
  Symbol.for('Typeless optional object token'),
  simpleOptionalObjectSchema,
)
const typelessRecordToken = InjectionToken.create(
  Symbol.for('Typeless record token'),
  simpleRecordSchema,
)
const typelessOptionalRecordToken = InjectionToken.create(
  Symbol.for('Typeless optional record token'),
  simpleOptionalRecordSchema,
)

const typedObjectToken = InjectionToken.create<
  FooService,
  typeof simpleObjectSchema
>(Symbol.for('Typed object token'), simpleObjectSchema)
const typedOptionalObjectToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalObjectSchema
>(Symbol.for('Typed optional object token'), simpleOptionalObjectSchema)
const typedRecordToken = InjectionToken.create<
  FooService,
  typeof simpleRecordSchema
>(Symbol.for('Typed record token'), simpleRecordSchema)
const typedOptionalRecordToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalRecordSchema
>(Symbol.for('Typed optional record token'), simpleOptionalRecordSchema)

const typedToken = InjectionToken.create<FooService>(Symbol.for('Typed token'))

describe('inject', () => {
  test('#1 Classes', async () => {
    @Injectable()
    class Foo {
      makeFoo() {
        return 'foo'
      }
    }

    assertType<Foo>(await inject(Foo))
  })
})
