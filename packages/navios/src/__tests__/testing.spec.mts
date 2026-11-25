import { describe, expect, it } from 'vitest'

import { create } from '../client/create-navios.mjs'
import { makeNaviosFakeAdapter } from '../testing/index.mjs'

function setup() {
  const fake = makeNaviosFakeAdapter()
  return { fake, navios: create({ baseURL: 'http://x.test', adapter: fake.fetch }) }
}

describe('makeNaviosFakeAdapter', () => {
  it('should answer with an asynchronous mock', async () => {
    const { fake, navios } = setup()
    fake.mock('/a', 'GET', async () => Response.json({ a: 1 }))

    expect((await navios.get('/a')).data).toEqual({ a: 1 })
  })

  it('should record every request, also the ones without a mock', async () => {
    const { fake, navios } = setup()
    fake.mock('/a', 'POST', () => Response.json({}))

    await navios.post('/a', { x: 1 }, { params: { page: 2 }, headers: { 'X-A': '1' } })
    await navios.get('/missing').catch(() => {})

    expect(fake.requests).toHaveLength(2)
    const [first, second] = fake.requests
    expect(first).toMatchObject({
      url: 'http://x.test/a?page=2',
      path: '/a',
      method: 'POST',
      body: '{"x":1}',
    })
    expect(first!.query.get('page')).toBe('2')
    expect(first!.headers.get('x-a')).toBe('1')
    expect(second).toMatchObject({ path: '/missing', method: 'GET' })
  })

  it('should prefer a mock whose query matches, in any order', async () => {
    const { fake, navios } = setup()
    fake.mock('/a', 'GET', () => Response.json('any'))
    fake.mock('/a?page=2&sort=name', 'GET', () => Response.json('second'))

    expect((await navios.get('/a')).data).toBe('any')
    expect((await navios.get('/a', { params: { page: 1 } })).data).toBe('any')
    expect((await navios.get('/a', { params: { sort: 'name', page: 2 } })).data).toBe('second')
  })

  it('should not answer another query when only a mock with a query is registered', async () => {
    const { fake, navios } = setup()
    fake.mock('/a?page=2', 'GET', () => Response.json('second'))

    await expect(navios.get('/a', { params: { page: 1 } })).rejects.toThrow(
      'No mock for GET /a?page=1',
    )
  })

  it('should replace a mock registered for the same URL and method', async () => {
    const { fake, navios } = setup()
    fake.mock('/a', 'GET', () => Response.json(1))
    fake.mock('/a', 'GET', () => Response.json(2))

    expect((await navios.get('/a')).data).toBe(2)
  })

  it('should match absolute mock URLs and Request objects', async () => {
    const { fake } = setup()
    fake.mock('http://x.test/a', 'PUT', () => Response.json(1))

    const response = await fake.fetch(new Request('http://x.test/a', { method: 'PUT' }))

    expect(await response.json()).toBe(1)
  })

  it('should forget mocks and requests on reset()', async () => {
    const { fake, navios } = setup()
    fake.mock('/a', 'GET', () => Response.json(1))
    await navios.get('/a')

    fake.reset()

    expect(fake.requests).toHaveLength(0)
    await expect(navios.get('/a')).rejects.toThrow('No mock for GET /a')
  })
})
