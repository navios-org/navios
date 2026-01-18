import { describe, expect, it } from 'vitest'

import { create } from '../createNavios.mjs'
import { makeNaviosFakeAdapter } from '../testing/index.mjs'

describe('navios::get', () => {
  it('should make a simple GET request', async () => {
    const mockAdapter = makeNaviosFakeAdapter()
    const navios = create({ adapter: mockAdapter.fetch })
    mockAdapter.mock('/test', 'GET', () => new Response(JSON.stringify({ test: 'value' })))
    const response = await navios.get('/test')
    expect(response.status).toBe(200)
    expect(response.data).toEqual({ test: 'value' })
  })
  it('should work with query params', async () => {
    const mockAdapter = makeNaviosFakeAdapter()
    const navios = create({ adapter: mockAdapter.fetch })
    mockAdapter.mock('/test', 'GET', (req) => {
      expect(req).toBe('/test?query=param')
      return new Response(JSON.stringify({ test: 'value' }))
    })
    const response = await navios.get('/test', { params: { query: 'param' } })
    expect(response.status).toBe(200)
    expect(response.data).toEqual({ test: 'value' })
  })
  it('should work with URLSearchParams', async () => {
    const mockAdapter = makeNaviosFakeAdapter()
    const navios = create({ adapter: mockAdapter.fetch })
    mockAdapter.mock('/test', 'GET', (req) => {
      expect(req).toBe('/test?query=param')
      return new Response(JSON.stringify({ test: 'value' }))
    })
    const response = await navios.get('/test', {
      params: new URLSearchParams('query=param'),
    })
    expect(response.status).toBe(200)
    expect(response.data).toEqual({ test: 'value' })
  })
  it('should throw when status is not 2xx', async () => {
    const mockAdapter = makeNaviosFakeAdapter()
    const navios = create({ adapter: mockAdapter.fetch })
    mockAdapter.mock(
      '/test',
      'GET',
      () =>
        new Response('error', {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {
            'content-type': 'text/plain',
          },
        }),
    )
    await expect(navios.get('/test')).rejects.toThrow('Request failed with Internal Server Error')
  })
})
