import { describe, expect, it } from 'vitest'

import { create } from '../createNavios.mjs'
import { makeNaviosFakeAdapter } from '../testing/index.mjs'

describe('navios::post', () => {
  it('should make a simple GET request', async () => {
    const mockAdapter = makeNaviosFakeAdapter()
    const navios = create({ adapter: mockAdapter.fetch })
    mockAdapter.mock('/test/post', 'POST', (_, req) => new Response(req?.body, {}))
    const response = await navios.post('/test/post', {
      test: 'value',
    })
    expect(response.status).toBe(200)
    expect(response.data).toEqual({ test: 'value' })
  })
  it('should work with query params', async () => {
    const mockAdapter = makeNaviosFakeAdapter()
    const navios = create({ adapter: mockAdapter.fetch })
    mockAdapter.mock('/test', 'POST', (url, req) => {
      expect(url).toBe('/test?query=param')
      return new Response(req?.body)
    })
    const response = await navios.post('/test', { test: 'value' }, { params: { query: 'param' } })
    expect(response.status).toBe(200)
    expect(response.data).toEqual({ test: 'value' })
  })
  it('should throw when status is not 2xx', async () => {
    const mockAdapter = makeNaviosFakeAdapter()
    const navios = create({ adapter: mockAdapter.fetch })
    mockAdapter.mock(
      '/test',
      'POST',
      () =>
        new Response(
          JSON.stringify({
            error: 'message',
          }),
          {
            status: 400,
            statusText: 'Bad Request',
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
    )
    const failedRequest = navios.post('/test')
    await expect(failedRequest).rejects.toThrow('Request failed with Bad Request')
    await expect(failedRequest).rejects.toMatchObject({
      response: {
        data: { error: 'message' },
        status: 400,
        statusText: 'Bad Request',
      },
    })
  })
})
