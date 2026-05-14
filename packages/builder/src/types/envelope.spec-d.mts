import { expectTypeOf, test } from 'vitest'

import type {
  ResponseEnvelope,
  ResponseEnvelopeErr,
  ResponseEnvelopeOk,
  ResponseMeta,
} from './envelope.mjs'

interface User {
  id: string
  name: string
}
interface ApiError {
  code: string
  message: string
}

test('ResponseMeta has status, statusText, headers', () => {
  expectTypeOf<ResponseMeta>().toEqualTypeOf<{
    status: number
    statusText: string
    headers: Headers
  }>()
})

test('ResponseEnvelopeOk discriminator narrows data', () => {
  const env = {} as ResponseEnvelope<User, ApiError>
  if (env.ok) {
    expectTypeOf(env.data).toEqualTypeOf<User>()
    expectTypeOf(env.error).toEqualTypeOf<null>()
    expectTypeOf(env.response).toEqualTypeOf<ResponseMeta>()
  } else {
    expectTypeOf(env.data).toEqualTypeOf<null>()
    expectTypeOf(env.error).toEqualTypeOf<ApiError>()
    expectTypeOf(env.response).toEqualTypeOf<ResponseMeta | null>()
  }
})

test('Destructuring narrowing via error null check', () => {
  const env = {} as ResponseEnvelope<User, ApiError>
  const { data, error } = env
  if (error) {
    expectTypeOf(error).toEqualTypeOf<ApiError>()
  } else {
    expectTypeOf(data).toEqualTypeOf<User>()
  }
})

test('Branches are exported individually', () => {
  expectTypeOf<ResponseEnvelopeOk<User>>().toMatchTypeOf<ResponseEnvelope<User, never>>()
  expectTypeOf<ResponseEnvelopeErr<ApiError>>().toMatchTypeOf<ResponseEnvelope<never, ApiError>>()
})
