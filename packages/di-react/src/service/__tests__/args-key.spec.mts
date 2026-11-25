import { describe, expect, it } from 'vitest'

import { getArgsKey } from '../args-key.mjs'

describe('getArgsKey', () => {
  it('should give equal keys to args that serialize the same', () => {
    expect(getArgsKey({ userId: '1' })).toBe(getArgsKey({ userId: '1' }))
    expect(getArgsKey('a')).toBe(getArgsKey('a'))
    expect(getArgsKey(undefined)).toBe(getArgsKey(undefined))
  })

  it('should give different keys to different args', () => {
    expect(getArgsKey({ userId: '1' })).not.toBe(getArgsKey({ userId: '2' }))
    expect(getArgsKey('1')).not.toBe(getArgsKey(1))
    expect(getArgsKey(undefined)).not.toBe(getArgsKey({}))
  })

  it('should key values JSON cannot serialize by identity instead of throwing', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const other: Record<string, unknown> = {}
    other.self = other

    expect(getArgsKey(cycle)).toBe(getArgsKey(cycle))
    expect(getArgsKey(cycle)).not.toBe(getArgsKey(other))
    expect(getArgsKey(1n)).toBe(getArgsKey(1n))
    expect(getArgsKey(1n)).not.toBe(getArgsKey(2n))
  })
})
