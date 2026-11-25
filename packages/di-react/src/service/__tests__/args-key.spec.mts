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

  it('should tell apart what the container compares by value and JSON does not', () => {
    const pairs: [() => unknown, () => unknown][] = [
      [() => new Set([1]), () => new Set([2])],
      [() => new Map([['a', 1]]), () => new Map([['a', 2]])],
      [() => new Map(), () => new Set()],
      [() => /a/, () => /b/],
      [() => new Date(0), () => new Date(1)],
      [() => new URL('http://a'), () => new URL('http://b')],
      [() => 1n, () => 2n],
      [() => 1n, () => '1'],
      [() => new Set(['a']), () => ['a']],
    ]
    for (const [left, right] of pairs) {
      expect(getArgsKey({ value: left() })).toBe(getArgsKey({ value: left() }))
      expect(getArgsKey({ value: left() })).not.toBe(getArgsKey({ value: right() }))
      expect(getArgsKey(left())).not.toBe(getArgsKey(right()))
    }
    expect(getArgsKey({ ids: new Set([new Map([['a', 1]])]) })).not.toBe(
      getArgsKey({ ids: new Set([new Map([['a', 2]])]) }),
    )
  })

  it('should not count a new function as a change', () => {
    expect(getArgsKey({ id: 1, onChange: () => 1 })).toBe(getArgsKey({ id: 1, onChange: () => 1 }))
  })
})
