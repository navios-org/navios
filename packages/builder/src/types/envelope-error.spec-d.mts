import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type {
  EnvelopeError,
  HttpErrorVariant,
  NetworkErrorVariant,
  UnknownHttpErrorVariant,
  ValidationErrorVariant,
} from './envelope-error.mjs'

const errorSchema = {
  404: z.object({ kind: z.literal('not_found') }),
  401: z.object({ kind: z.literal('unauthorized'), retryAfter: z.number() }),
}

type E = EnvelopeError<typeof errorSchema>

test('EnvelopeError union covers four kinds', () => {
  const e = {} as E
  if (e.kind === 'http') {
    expectTypeOf(e.status).toEqualTypeOf<404 | 401>()
  } else if (e.kind === 'http-unknown') {
    expectTypeOf(e.status).toEqualTypeOf<number>()
    expectTypeOf(e.body).toEqualTypeOf<unknown>()
  } else if (e.kind === 'validation') {
    expectTypeOf(e.status).toEqualTypeOf<number>()
  } else {
    expectTypeOf(e.kind).toEqualTypeOf<'network'>()
  }
})

test('HttpErrorVariant.status narrows body', () => {
  const v = {} as HttpErrorVariant<typeof errorSchema>
  if (v.status === 404) {
    expectTypeOf(v.body).toEqualTypeOf<{ kind: 'not_found' } & { readonly status: 404 }>()
  } else {
    expectTypeOf(v.status).toEqualTypeOf<401>()
    expectTypeOf(v.body).toEqualTypeOf<
      { kind: 'unauthorized'; retryAfter: number } & { readonly status: 401 }
    >()
  }
})

test('Variant types exist standalone', () => {
  expectTypeOf<UnknownHttpErrorVariant>().toHaveProperty('kind')
  expectTypeOf<ValidationErrorVariant>().toHaveProperty('issues')
  expectTypeOf<NetworkErrorVariant>().toHaveProperty('cause')
})
