import { describe, expect, it } from 'vitest'

import { create } from '../client/create-navios.mjs'
import { NaviosError } from '../navios-error.mjs'

function clientFor(respond: () => Response) {
  return create({ baseURL: 'http://x.test', adapter: async () => respond() })
}

describe('navios::response body', () => {
  it('should resolve an empty 204 body as undefined for responseType json', async () => {
    const navios = clientFor(() => new Response(null, { status: 204 }))

    const response = await navios.delete('/items/1')

    expect(response.status).toBe(204)
    expect(response.data).toBeUndefined()
  })

  it('should resolve an empty 200 body as undefined for responseType json', async () => {
    const navios = clientFor(() => new Response('', { status: 200 }))

    const response = await navios.post('/items')

    expect(response.status).toBe(200)
    expect(response.data).toBeUndefined()
  })

  it('should still parse a JSON body', async () => {
    const navios = clientFor(() => Response.json({ a: 1 }))

    expect((await navios.get('/items')).data).toEqual({ a: 1 })
  })

  it('should reject a 2xx with an unparsable body with an error that carries the response', async () => {
    const navios = clientFor(
      () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    )

    const error = await navios.get('/items').catch((err) => err)

    expect(error).toBeInstanceOf(NaviosError)
    expect(error.response.status).toBe(200)
    expect(error.response.data).toBe('<html>')
    expect(error.response.headers.get('content-type')).toBe('text/html')
    expect(error.cause).toBeInstanceOf(SyntaxError)
  })

  it('should keep the status of an error response with an empty JSON body', async () => {
    const navios = clientFor(
      () => new Response('', { status: 500, headers: { 'content-type': 'application/json' } }),
    )

    const error = await navios.get('/items').catch((err) => err)

    expect(error).toBeInstanceOf(NaviosError)
    expect(error.response.status).toBe(500)
    expect(error.response.data).toBeUndefined()
  })

  it('should keep the raw text of an error response whose JSON body is malformed', async () => {
    const navios = clientFor(
      () => new Response('{oops', { status: 502, headers: { 'content-type': 'application/json' } }),
    )

    const error = await navios.get('/items').catch((err) => err)

    expect(error).toBeInstanceOf(NaviosError)
    expect(error.response.status).toBe(502)
    expect(error.response.data).toBe('{oops')
  })

  it('should not fail a text response that claims to be JSON but is not', async () => {
    const navios = clientFor(
      () => new Response('', { status: 200, headers: { 'content-type': 'application/json' } }),
    )

    const response = await navios.get('/items', { responseType: 'text' })

    expect(response.data).toBe('')
  })
})
