import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { EnvelopeError } from '../types/envelope-error.mjs'

import { isHttpError } from './guards.mjs'

const errorSchema = {
  404: z.object({ kind: z.literal('not_found') }),
  401: z.object({ kind: z.literal('unauthorized') }),
}

test('isHttpError(e) narrows to HttpErrorVariant', () => {
  const e = {} as EnvelopeError<typeof errorSchema>
  if (isHttpError(e)) {
    expectTypeOf(e.kind).toEqualTypeOf<'http'>()
    expectTypeOf(e.status).toEqualTypeOf<404 | 401>()
  }
})

test('isHttpError(e, 404) narrows to the 404 body', () => {
  const e = {} as EnvelopeError<typeof errorSchema>
  if (isHttpError(e, 404)) {
    expectTypeOf(e.status).toEqualTypeOf<404>()
    expectTypeOf(e.body).toMatchTypeOf<{ kind: 'not_found' }>()
  }
})
