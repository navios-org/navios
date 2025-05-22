import { describe, expect, it } from 'vitest'

import { bindUrlParams } from '../index.mjs'

describe('bindUrlParams', () => {
  it('should replace url params', () => {
    const url = bindUrlParams('/users/$id', {
      urlParams: { id: 1 },
    })

    expect(url).toBe('/users/1')
  })

  it('should replace multiple url params', () => {
    const url = bindUrlParams('/users/$id/$name', {
      urlParams: { id: 1, name: 'john' },
    })

    expect(url).toBe('/users/1/john')
  })

  it('should not replace url params if not present', () => {
    // @ts-ignore We're testing a specific case
    const url = bindUrlParams('/users/$id', {})

    expect(url).toBe('/users/$id')
  })

  it('should replace multiple occurrences of the same param', () => {
    const url = bindUrlParams('/users/$id/$id', {
      urlParams: { id: 1 },
    })

    expect(url).toBe('/users/1/1')
  })
})
