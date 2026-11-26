import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../builder.mjs'

import type { BuilderInstance, EndpointErrorType, InferEndpointError } from '../../index.mjs'

const apiError = z.object({ error: z.object({ message: z.string() }) })
const missing = z.object({ missing: z.literal(true) })
const userSchema = z.object({ id: z.string() })

const api = builder({ errorSchema: { 401: apiError, 404: apiError } })

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
  errorSchema: { 404: missing, 409: apiError },
})
const getMe = api.declareEndpoint({ method: 'GET', url: '/me', responseSchema: userSchema })

type HttpBody<E, S extends number> = E extends { kind: 'http'; status: S; body: infer B }
  ? B
  : never

describe('builder({ errorSchema })', () => {
  test('types shared statuses on an endpoint without its own errorSchema', () => {
    type E = EndpointErrorType<typeof getMe>
    expectTypeOf<HttpBody<E, 401>>().toEqualTypeOf<{ error: { message: string } }>()
    expectTypeOf<HttpBody<E, 409>>().toEqualTypeOf<never>()
  })

  test("adds the endpoint's statuses, its own entry winning", () => {
    type E = EndpointErrorType<typeof getUser>
    expectTypeOf<HttpBody<E, 404>>().toEqualTypeOf<{ missing: true }>()
    expectTypeOf<HttpBody<E, 401>>().toEqualTypeOf<{ error: { message: string } }>()
    expectTypeOf<HttpBody<E, 409>>().toEqualTypeOf<{ error: { message: string } }>()
  })

  test('keeps the type parameter on withClient and errorSchema', () => {
    expectTypeOf(api.withClient({ request: async () => ({}) as never })).toEqualTypeOf(api)
    expectTypeOf<keyof typeof api.errorSchema>().toEqualTypeOf<401 | 404>()
  })

  test('changes nothing for a builder without shared schemas', () => {
    const plain = builder()
    const ep = plain.declareEndpoint({
      method: 'GET',
      url: '/me',
      responseSchema: userSchema,
      errorSchema: { 404: missing },
    })
    expectTypeOf(plain).toEqualTypeOf<BuilderInstance>()
    expectTypeOf(ep.config.errorSchema).toEqualTypeOf<{ readonly 404: typeof missing }>()
    expectTypeOf<EndpointErrorType<typeof ep>>().toEqualTypeOf<
      InferEndpointError<typeof ep.config>
    >()
  })
})
