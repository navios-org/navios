import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { renderToXml } from '../runtime/render-to-xml.mjs'
import { defineTag } from './define-tag.mjs'

describe('defineTag', () => {
  describe('basic tags', () => {
    it('should create a simple tag without props', () => {
      const item = defineTag('item')

      const node = item({})
      expect(node).toEqual({
        type: 'item',
        props: {},
        children: [],
      })
    })

    it('should handle tag name with namespace prefix', () => {
      const atomLink = defineTag('atom:link')

      const node = atomLink({})
      expect(node.type).toBe('atom:link')
    })

    it('should expose tagName property', () => {
      const myTag = defineTag('my-custom-tag')
      expect(myTag.tagName).toBe('my-custom-tag')
    })
  })

  describe('props handling', () => {
    it('should pass props through to the node', () => {
      const link = defineTag('link')

      const node = link({ href: 'https://example.com', rel: 'self' })
      expect(node.props).toEqual({
        href: 'https://example.com',
        rel: 'self',
      })
    })

    it('should handle undefined props gracefully', () => {
      const item = defineTag('item')

      const node = item(undefined as any)
      expect(node).toEqual({
        type: 'item',
        props: {},
        children: [],
      })
    })

    it('should handle null props gracefully', () => {
      const item = defineTag('item')

      const node = item(null as any)
      expect(node).toEqual({
        type: 'item',
        props: {},
        children: [],
      })
    })
  })

  describe('children handling', () => {
    it('should handle single child', () => {
      const container = defineTag('container')

      const node = container({ children: 'Hello' })
      expect(node.children).toEqual(['Hello'])
    })

    it('should handle array of children', () => {
      const container = defineTag('container')
      const child1 = { type: 'a', props: {}, children: [] }
      const child2 = { type: 'b', props: {}, children: [] }

      const node = container({ children: [child1, child2] })
      expect(node.children).toEqual([child1, child2])
    })

    it('should handle no children', () => {
      const selfClosing = defineTag('br')

      const node = selfClosing({})
      expect(node.children).toEqual([])
    })
  })

  describe('Zod schema validation', () => {
    it('should validate props against schema', () => {
      const atomLink = defineTag(
        'atom:link',
        z.object({
          href: z.string().url(),
          rel: z.enum(['self', 'alternate']),
        }),
      )

      const node = atomLink({
        href: 'https://example.com/feed',
        rel: 'self',
      })

      expect(node.type).toBe('atom:link')
      expect(node.props).toEqual({
        href: 'https://example.com/feed',
        rel: 'self',
      })
    })

    it('should throw on invalid props', () => {
      const atomLink = defineTag(
        'atom:link',
        z.object({
          href: z.string().url(),
          rel: z.enum(['self', 'alternate']),
        }),
      )

      expect(() =>
        atomLink({
          href: 'not-a-valid-url',
          rel: 'self',
        }),
      ).toThrow()
    })

    it('should throw on missing required props', () => {
      const atomLink = defineTag(
        'atom:link',
        z.object({
          href: z.string().url(),
          rel: z.enum(['self', 'alternate']),
        }),
      )

      expect(() =>
        atomLink({
          href: 'https://example.com',
          // missing rel
        } as any),
      ).toThrow()
    })

    it('should allow optional props in schema', () => {
      const atomLink = defineTag(
        'atom:link',
        z.object({
          href: z.string().url(),
          rel: z.enum(['self', 'alternate']),
          type: z.string().optional(),
        }),
      )

      const node = atomLink({
        href: 'https://example.com/feed',
        rel: 'self',
      })

      expect(node.props).toEqual({
        href: 'https://example.com/feed',
        rel: 'self',
      })
    })

    it('should include optional props when provided', () => {
      const atomLink = defineTag(
        'atom:link',
        z.object({
          href: z.string().url(),
          rel: z.enum(['self', 'alternate']),
          type: z.string().optional(),
        }),
      )

      const node = atomLink({
        href: 'https://example.com/feed',
        rel: 'self',
        type: 'application/rss+xml',
      })

      expect(node.props).toEqual({
        href: 'https://example.com/feed',
        rel: 'self',
        type: 'application/rss+xml',
      })
    })
  })

  describe('integration with renderToXml', () => {
    it('should render a defined tag', async () => {
      const item = defineTag('item')
      const title = defineTag('title')

      const node = item({ children: [title({ children: 'Hello World' })] })

      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<item><title>Hello World</title></item>')
    })

    it('should render a namespaced tag with attributes', async () => {
      const atomLink = defineTag(
        'atom:link',
        z.object({
          href: z.string().url(),
          rel: z.enum(['self', 'alternate']),
          type: z.string().optional(),
        }),
      )

      const node = atomLink({
        href: 'https://example.com/feed',
        rel: 'self',
        type: 'application/rss+xml',
      })

      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<atom:link href="https://example.com/feed" rel="self" type="application/rss+xml"/>')
    })

    it('should compose multiple defined tags', async () => {
      const rss = defineTag(
        'rss',
        z.object({
          version: z.literal('2.0'),
        }),
      )
      const channel = defineTag('channel')
      const title = defineTag('title')
      const link = defineTag('link')

      const node = rss({
        version: '2.0',
        children: [
          channel({
            children: [title({ children: 'My Feed' }), link({ children: 'https://example.com' })],
          }),
        ],
      })

      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe(
        '<rss version="2.0"><channel><title>My Feed</title><link>https://example.com</link></channel></rss>',
      )
    })
  })
})
