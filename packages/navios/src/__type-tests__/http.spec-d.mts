import { describe, expectTypeOf, test } from 'vitest'

import navios, { create, HttpClientError, isHttpClientError } from '../index.mjs'
import { makeNaviosFakeAdapter } from '../testing/index.mjs'

import type { Navios, NaviosResponse, PreparedRequestConfig } from '../index.mjs'

interface User {
  id: string
}

const client = create({ baseURL: 'http://x.test' })

describe('requests', () => {
  test('the result type is given by the caller', () => {
    expectTypeOf(client.get<User>('/u')).resolves.toEqualTypeOf<NaviosResponse<User>>()
    expectTypeOf(client.get('/u')).resolves.toEqualTypeOf<NaviosResponse<unknown>>()
  })

  test('params take any serialisable values', () => {
    expectTypeOf(client.get).toBeCallableWith('/u', {
      params: { tags: ['a'], from: new Date(), skipped: undefined, flag: true },
    })
    expectTypeOf(client.get).toBeCallableWith('/u', { params: new URLSearchParams() })
  })

  test('headers take every form fetch takes', () => {
    expectTypeOf(client.get).toBeCallableWith('/u', { headers: new Headers() })
    expectTypeOf(client.get).toBeCallableWith('/u', { headers: [['x-a', '1']] })
    expectTypeOf(client.get).toBeCallableWith('/u', { headers: { 'x-a': undefined, 'x-b': 1 } })
  })

  test('options that were never read are gone', () => {
    // @ts-expect-error use `signal`
    void client.get('/u', { cancelToken: new AbortController().signal })
  })
})

describe('configuration', () => {
  test('create and defaults take the options a request falls back to', () => {
    expectTypeOf(create).toBeCallableWith({
      timeout: 5000,
      credentials: 'include',
      withCredentials: true,
      cache: 'no-store',
    })
    client.defaults.timeout = 5000
    client.defaults.credentials = 'same-origin'
    expectTypeOf(create().defaults.timeout).toEqualTypeOf<number | undefined>()
    expectTypeOf(client.create).toBeCallableWith({ timeout: 1000 })
  })

  test('what belongs to one request is not a default', () => {
    // @ts-expect-error a signal aborts one request
    create({ signal: new AbortController().signal })
    // @ts-expect-error the method is given per request
    create({ method: 'POST' })
  })
})

describe('interceptors', () => {
  test('are typed, optional and may return nothing', () => {
    client.interceptors.request.use((config) => {
      expectTypeOf(config).toEqualTypeOf<PreparedRequestConfig>()
      config.headers.Authorization = 'x'
    })
    client.interceptors.response.use(null, (error) => {
      expectTypeOf(error).toEqualTypeOf<HttpClientError>()
      throw error
    })
    // @ts-expect-error a response interceptor cannot turn a response into something else
    client.interceptors.response.use(() => 'nope')
  })
})

describe('errors', () => {
  test('the guard narrows unknown', () => {
    const caught: unknown = null
    if (isHttpClientError<{ code: string }>(caught)) {
      expectTypeOf(caught.response).toEqualTypeOf<NaviosResponse<{ code: string }> | null>()
      expectTypeOf(caught.status).toEqualTypeOf<number | undefined>()
    }
  })
})

describe('the default export', () => {
  test('is a function and a client', () => {
    expectTypeOf(navios).toExtend<Navios>()
    expectTypeOf(navios<User>({ url: '/u' })).resolves.toEqualTypeOf<NaviosResponse<User>>()
  })
})

describe('testing', () => {
  test('mocks may be asynchronous', () => {
    const fake = makeNaviosFakeAdapter()
    expectTypeOf(fake.mock).toBeCallableWith('/x', 'GET', async () => Response.json({}))
    expectTypeOf(fake.requests[0]!.headers).toEqualTypeOf<Headers>()
  })
})
