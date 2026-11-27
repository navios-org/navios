import { describe, expectTypeOf, test } from 'vitest'

import { createEventSourceHandler } from '../eventsource/index.mjs'
import { createWebSocketHandler, isConnectionError } from '../socket/index.mjs'

import type { ConnectionError, ConnectionIssue } from '../eventsource/index.mjs'
import type { NaviosError } from '../index.mjs'

describe('the base URL', () => {
  test('is spelled baseURL, as in @navios/http', () => {
    expectTypeOf(createWebSocketHandler).toBeCallableWith({ baseURL: 'wss://api.example.com' })
    expectTypeOf(createEventSourceHandler).toBeCallableWith({ baseURL: 'https://api.example.com' })
    // @ts-expect-error renamed to baseURL
    createWebSocketHandler({ baseUrl: 'wss://api.example.com' })
    // @ts-expect-error renamed to baseURL
    createEventSourceHandler({ baseUrl: 'https://api.example.com' })
  })
})

describe('ConnectionError', () => {
  test('fields and kinds', () => {
    const error = null as unknown as ConnectionError

    expectTypeOf(error).toExtend<NaviosError>()
    expectTypeOf(error.kind).toEqualTypeOf<'config' | 'request-validation'>()
    expectTypeOf(error.url).toEqualTypeOf<string>()
    expectTypeOf(error.issues).toEqualTypeOf<readonly ConnectionIssue[] | undefined>()
    expectTypeOf<ConnectionIssue['part']>().toEqualTypeOf<'urlParams' | 'params'>()
  })

  test('the guard narrows unknown', () => {
    const value = null as unknown
    if (isConnectionError(value)) {
      expectTypeOf(value).toEqualTypeOf<ConnectionError>()
    }
  })
})
