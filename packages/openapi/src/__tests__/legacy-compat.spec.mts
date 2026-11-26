import { describe, expect, it } from 'vitest'

import * as standard from '../index.mjs'
import * as legacy from '../legacy-compat/index.mjs'

describe('@navios/openapi/legacy-compat', () => {
  const pairs = [
    ['ApiDeprecated()', standard.ApiDeprecated(), legacy.ApiDeprecated()],
    ['ApiDeprecated(message)', standard.ApiDeprecated('old'), legacy.ApiDeprecated('old')],
    ['ApiExclude()', standard.ApiExclude(), legacy.ApiExclude()],
    [
      'ApiOperation(options)',
      standard.ApiOperation({ summary: 'Get', operationId: 'get' }),
      legacy.ApiOperation({ summary: 'Get', operationId: 'get' }),
    ],
    [
      'ApiSecurity(requirement)',
      standard.ApiSecurity({ bearer: ['read'] }),
      legacy.ApiSecurity({ bearer: ['read'] }),
    ],
    [
      'ApiStream(options)',
      standard.ApiStream({ contentType: 'text/plain' }),
      legacy.ApiStream({ contentType: 'text/plain' }),
    ],
    ['ApiSummary(text)', standard.ApiSummary('Get'), legacy.ApiSummary('Get')],
    ['ApiTag(name)', standard.ApiTag('Users'), legacy.ApiTag('Users')],
    [
      'ApiTag(name, description)',
      standard.ApiTag('Users', 'User management'),
      legacy.ApiTag('Users', 'User management'),
    ],
  ] as const

  it.each(pairs)('%s stores what the standard attribute stores', (_, expected, actual) => {
    expect(actual.token).toBe(expected.token)
    expect(actual.value).toEqual(expected.value)
  })

  it('validates values with the same schemas', () => {
    // @ts-expect-error a summary is a string
    expect(() => legacy.ApiSummary(42)).toThrow()
    // @ts-expect-error a tag needs a name
    expect(() => legacy.ApiTag(undefined)).toThrow()
  })
})
