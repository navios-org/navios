import { afterEach, describe, expect, it } from 'vitest'

import { envInt, envString } from '../config/env.mjs'

afterEach(() => {
  delete process.env.NAVIOS_TEST_PORT
})

describe('envInt', () => {
  it.each([
    ['8080', 8080],
    [' 8080 ', 8080],
    ['-1', -1],
    ['+5', 5],
    ['0', 0],
  ])('reads %j', (raw, expected) => {
    process.env.NAVIOS_TEST_PORT = raw

    expect(envInt('NAVIOS_TEST_PORT', 3000)).toBe(expected)
  })

  it('falls back to the default when the variable is missing or empty', () => {
    expect(envInt('NAVIOS_TEST_PORT', 3000)).toBe(3000)
    process.env.NAVIOS_TEST_PORT = ''
    expect(envInt('NAVIOS_TEST_PORT', 3000)).toBe(3000)
    process.env.NAVIOS_TEST_PORT = '  '
    expect(envInt('NAVIOS_TEST_PORT', 3000)).toBe(3000)
  })

  it.each(['abc', '12abc', '1e3', '3.9', '0x1F', 'NaN', '99999999999999999999'])(
    'throws on %j, naming the variable and not the value',
    (raw) => {
      process.env.NAVIOS_TEST_PORT = raw

      expect(() => envInt('NAVIOS_TEST_PORT', 3000)).toThrow(
        '[Navios] The environment variable NAVIOS_TEST_PORT is not an integer.',
      )
    },
  )
})

describe('envString', () => {
  it('reads a string, or the default', () => {
    expect(envString('NAVIOS_TEST_PORT')).toBeUndefined()
    expect(envString('NAVIOS_TEST_PORT', 'fallback')).toBe('fallback')
    process.env.NAVIOS_TEST_PORT = 'value'
    expect(envString('NAVIOS_TEST_PORT', 'fallback')).toBe('value')
  })
})
