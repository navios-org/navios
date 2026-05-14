import { expectTypeOf, test } from 'vitest'

import type { BaseEndpointOptions, BuilderConfig } from './config.mjs'

test('BaseEndpointOptions.result accepts data | envelope', () => {
  const a: BaseEndpointOptions = { method: 'GET', url: '/u', result: 'data' }
  const b: BaseEndpointOptions = { method: 'GET', url: '/u', result: 'envelope' }
  expectTypeOf(a.result).toEqualTypeOf<'data' | 'envelope' | undefined>()
  expectTypeOf(b.result).toEqualTypeOf<'data' | 'envelope' | undefined>()
})

test('BaseEndpointOptions.validateResponse accepts boolean', () => {
  const a: BaseEndpointOptions = { method: 'GET', url: '/u', validateResponse: false }
  expectTypeOf(a.validateResponse).toEqualTypeOf<boolean | undefined>()
})

test('BuilderConfig.defaults.result configures default mode', () => {
  const c: BuilderConfig = { defaults: { result: 'envelope' } }
  expectTypeOf(c.defaults).toEqualTypeOf<{ result?: 'data' | 'envelope' } | undefined>()
})
