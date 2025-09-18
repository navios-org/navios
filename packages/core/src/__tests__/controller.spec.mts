import { builder } from '@navios/builder'

import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointParams } from '../decorators/index.mjs'

import { Controller, Endpoint } from '../decorators/index.mjs'
import { extractControllerMetadata } from '../index.mjs'

describe('Controller decorator', () => {
  const api = builder({
    useDiscriminatorResponse: true,
  })
  const endpoint = api.declareEndpoint({
    url: 'test/$test/foo' as const,
    method: 'GET',
    querySchema: z.object({
      test: z.string(),
    }),
    responseSchema: z.object({
      foo: z.string(),
    }),
  })
  const endpoint2 = api.declareEndpoint({
    url: 'test/$test/foo',
    method: 'POST',
    requestSchema: z.object({
      test: z.string(),
    }),
    responseSchema: z.object({
      foo: z.string(),
    }),
  })
  it('should work with class', async () => {
    @Controller()
    class Test {
      @Endpoint(endpoint)
      async getBar(params: EndpointParams<typeof endpoint>) {
        return {
          foo: 'bar',
        }
      }

      @Endpoint(endpoint2)
      async postBar(params: EndpointParams<typeof endpoint2>) {
        return {
          foo: params.data.test,
        }
      }
    }

    const metadata = extractControllerMetadata(Test)
    expect(metadata).toBeDefined()
    expect(metadata.endpoints).toBeInstanceOf(Set)
    expect(metadata.endpoints.size).toBe(2)
  })
})
