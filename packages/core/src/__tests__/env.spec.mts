import { afterEach, describe, expect, it } from 'vitest'

import { envInt, envString } from '../config/env.mjs'

describe('envInt', () => {
  afterEach(() => {
    delete process.env.NAVIOS_TEST_PORT
  })

  it('reads an integer', () => {
    process.env.NAVIOS_TEST_PORT = '8080'

    expect(envInt('NAVIOS_TEST_PORT', 3000)).toBe(8080)
  })

  it('falls back to the default when the variable is missing, empty or not a number', () => {
    expect(envInt('NAVIOS_TEST_PORT', 3000)).toBe(3000)
    process.env.NAVIOS_TEST_PORT = ''
    expect(envInt('NAVIOS_TEST_PORT', 3000)).toBe(3000)
    process.env.NAVIOS_TEST_PORT = 'abc'
    expect(envInt('NAVIOS_TEST_PORT', 3000)).toBe(3000)
  })

  it('reads a string, or the default', () => {
    expect(envString('NAVIOS_TEST_PORT', 'fallback')).toBe('fallback')
    process.env.NAVIOS_TEST_PORT = 'value'
    expect(envString('NAVIOS_TEST_PORT', 'fallback')).toBe('value')
  })
})
