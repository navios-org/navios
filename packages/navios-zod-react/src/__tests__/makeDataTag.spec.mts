import { declareAPI } from '@navios/navios-zod'

import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { makeDataTag } from '../makeDataTag.mjs'

describe('makeDataTag', () => {
  it('should be defined', () => {
    expect(makeDataTag).toBeDefined()
  })
  it('should be a function', () => {
    expect(typeof makeDataTag).toBe('function')
  })
  it('should return a string', () => {
    const api = declareAPI({})
    const responseSchema = z.discriminatedUnion('success', [
      z.object({ success: z.literal(true), test: z.string() }),
      z.object({ success: z.literal(false), message: z.string() }),
    ])
    const endpoint = api.declareEndpoint({
      method: 'GET',
      url: '/test/$testId/foo/$fooId' as const,
      responseSchema,
    })

    const result = makeDataTag(endpoint, {
      processResponse(data) {
        return data
      },
    })
    expect(typeof result).toBe('function')
    expect(
      result({
        urlParams: { testId: '1', fooId: 'bar' },
      }),
    ).toMatchInlineSnapshot()
  })
  it('should return a string with the correct format', () => {
    const queryClient = new QueryClient()
    const api = declareAPI({})
    const responseSchema = z.discriminatedUnion('success', [
      z.object({ success: z.literal(true), test: z.string() }),
      z.object({ success: z.literal(false), message: z.string() }),
    ])
    const endpoint = api.declareEndpoint({
      method: 'GET',
      url: '/test/$testId/foo/$fooId' as const,
      responseSchema,
    })

    const result = makeDataTag(endpoint, {
      processResponse(data) {
        if (!data.success) {
          throw new Error(data.message)
        }
        return data
      },
    })
    expect(typeof result).toBe('function')
    const queryKey = result({
      urlParams: { testId: '1', fooId: 'bar' },
    })

    queryClient.setQueryData(queryKey, { success: true, test: 'bar' })
  })
})
