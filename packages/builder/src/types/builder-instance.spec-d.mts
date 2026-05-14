import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointHandler } from './builder-instance.mjs'

const dataOptions = {
  method: 'GET',
  url: '/u',
  responseSchema: z.object({ name: z.string() }),
} as const

const envelopeOptions = {
  method: 'GET',
  url: '/u',
  responseSchema: z.object({ name: z.string() }),
  errorSchema: { 404: z.object({ msg: z.string() }) },
  result: 'envelope',
} as const

test("result: 'data' (or omitted) returns parsed body", () => {
  type R = Awaited<ReturnType<EndpointHandler<typeof dataOptions, false>>>
  expectTypeOf<R>().toEqualTypeOf<{ name: string }>()
})

test("result: 'envelope' returns ResponseEnvelope", () => {
  type R = Awaited<ReturnType<EndpointHandler<typeof envelopeOptions, false>>>
  const r = {} as R
  if (r.ok) {
    expectTypeOf(r.data).toMatchTypeOf<{ name: string }>()
  } else {
    expectTypeOf(r.error.kind).toEqualTypeOf<'http' | 'http-unknown' | 'validation' | 'network'>()
  }
})
