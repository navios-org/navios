import { describe, expectTypeOf, it } from 'vitest'

import { Module } from '../index.mjs'

import type { ModuleOptions } from '../index.mjs'

describe('@Module options without a transport package', () => {
  it('accepts what every application understands', () => {
    class Shared {}
    expectTypeOf(Module).toBeCallableWith({ imports: [Shared], providers: [], guards: [] })
  })

  it('rejects options that a transport package adds', () => {
    class Users {}
    // @ts-expect-error `controllers` comes from @navios/server
    const http: ModuleOptions = { controllers: [Users] }
    // @ts-expect-error `prefix` comes from @navios/server
    const prefixed: ModuleOptions = { prefix: 'users' }
    void http
    void prefixed
  })
})
