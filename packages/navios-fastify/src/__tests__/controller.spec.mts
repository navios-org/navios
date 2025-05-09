import { declareAPI } from '@navios/navios-zod'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { EndpointParams } from '../decorators/endpoint.decorator.mjs'

import {
  Controller,
  ControllerMetadataKey,
  getControllerMetadata,
} from '../decorators/controller.decorator.mjs'
import { Endpoint } from '../decorators/endpoint.decorator.mjs'
import { inject } from '../service-locator/index.mjs'

describe('Controller decorator', () => {
  const api = declareAPI({
    useWholeResponse: true,
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
      getBar(params: EndpointParams<typeof endpoint>) {
        return {
          foo: 'bar',
        }
      }

      @Endpoint(endpoint2)
      postBar(params: EndpointParams<typeof endpoint2>) {
        return {
          foo: params.data.test,
        }
      }
    }

    const metadata = getControllerMetadata(Test)
    console.log(metadata)
    expect(metadata).toBeDefined()
    expect(metadata.endpoints).toBeInstanceOf(Map)
    expect(metadata.endpoints.size).toBe(1)
    expect(metadata.endpoints.get('test/$test/foo')).toBeInstanceOf(Map)
    expect(metadata.endpoints.get('test/$test/foo')?.get('GET')).toBeDefined()
    expect(metadata.endpoints.get('test/$test/foo')?.get('POST')).toBeDefined()
  })
})
