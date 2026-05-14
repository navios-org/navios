import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointHandler } from '@navios/builder'

import type { IsEnvelope } from './types.mjs'

const dataEp = (() => null) as unknown as EndpointHandler<{
  method: 'GET'
  url: '/u'
  responseSchema: z.ZodObject<{ a: z.ZodString }>
}>

const envEp = (() => null) as unknown as EndpointHandler<{
  method: 'GET'
  url: '/u'
  responseSchema: z.ZodObject<{ a: z.ZodString }>
  result: 'envelope'
}>

test('IsEnvelope detects per-endpoint result', () => {
  expectTypeOf<IsEnvelope<typeof dataEp>>().toEqualTypeOf<false>()
  expectTypeOf<IsEnvelope<typeof envEp>>().toEqualTypeOf<true>()
})
