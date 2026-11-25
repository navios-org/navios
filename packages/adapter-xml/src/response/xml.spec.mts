import { describe, expect, it } from 'vitest'

import { createElement } from '../jsx/create-element.mjs'

import { isXmlResponse, xml } from './xml.mjs'

describe('xml()', () => {
  it('should wrap the tree and options without rendering', () => {
    let called = false
    const Lazy = () => {
      called = true
      return createElement('lazy', null)
    }
    const node = createElement(Lazy, null)

    const response = xml(node, { contentType: 'application/rss+xml', status: 201 })

    expect(response.kind).toBe('xml')
    expect(response.status).toBe(201)
    expect(response.body.node).toBe(node)
    expect(response.body.options).toEqual({ contentType: 'application/rss+xml', status: 201 })
    expect(called).toBe(false)
  })

  it('should be recognised by isXmlResponse', () => {
    expect(isXmlResponse(xml(createElement('a', null)))).toBe(true)
    expect(isXmlResponse(createElement('a', null))).toBe(false)
    expect(isXmlResponse('<a/>')).toBe(false)
    expect(isXmlResponse(null)).toBe(false)
  })

  it('should not be confused with a custom result of another kind', async () => {
    const { result } = await import('@navios/server')

    expect(isXmlResponse(result('csv', 'a,b'))).toBe(false)
  })

  it('should default to status 200', () => {
    expect(xml(createElement('a', null)).status).toBe(200)
  })
})
