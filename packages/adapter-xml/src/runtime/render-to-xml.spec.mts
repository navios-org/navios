import { describe, expect, it } from 'vitest'

import { Fragment } from '../types/xml-node.mjs'

import { createElement } from './create-element.mjs'
import { renderToXml } from './render-to-xml.mjs'
import { CData, DangerouslyInsertRawXml } from './special-nodes.mjs'

describe('renderToXml', () => {
  describe('basic elements', () => {
    it('should render a simple element', async () => {
      const node = createElement('item', null)
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<item/>')
    })

    it('should render an element with text content', async () => {
      const node = createElement('title', null, 'Hello World')
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<title>Hello World</title>')
    })

    it('should render an element with attributes', async () => {
      const node = createElement('link', {
        href: 'https://example.com',
        rel: 'self',
      })
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<link href="https://example.com" rel="self"/>')
    })

    it('should render nested elements', async () => {
      const node = createElement('channel', null, createElement('title', null, 'My Feed'))
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<channel><title>My Feed</title></channel>')
    })

    it('should render numeric content', async () => {
      const node = createElement('count', null, 42)
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<count>42</count>')
    })

    it('should skip null and undefined children', async () => {
      const node = createElement('items', null, null, createElement('item', null), undefined)
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<items><item/></items>')
    })
  })

  describe('XML declaration', () => {
    it('should include XML declaration by default', async () => {
      const node = createElement('root', null)
      const xml = await renderToXml(node)
      expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?><root/>')
    })

    it('should omit XML declaration when disabled', async () => {
      const node = createElement('root', null)
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<root/>')
    })

    it('should use custom encoding', async () => {
      const node = createElement('root', null)
      const xml = await renderToXml(node, { encoding: 'ISO-8859-1' })
      expect(xml).toBe('<?xml version="1.0" encoding="ISO-8859-1"?><root/>')
    })
  })

  describe('XML escaping', () => {
    it('should escape special characters in text content', async () => {
      const node = createElement('text', null, 'Hello <world> & "friends"')
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<text>Hello &lt;world&gt; &amp; "friends"</text>')
    })

    it('should escape special characters in attributes', async () => {
      const node = createElement('link', {
        title: 'A "quoted" & <special> title',
      })
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<link title="A &quot;quoted&quot; &amp; &lt;special&gt; title"/>')
    })

    it('should skip null attributes', async () => {
      const node = createElement('link', {
        href: 'https://example.com',
        title: null,
        rel: undefined,
      })
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<link href="https://example.com"/>')
    })
  })

  describe('Fragment support', () => {
    it('should render fragment children without wrapper', async () => {
      const node = createElement(
        Fragment,
        null,
        createElement('item', null, 'A'),
        createElement('item', null, 'B'),
      )
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<item>A</item><item>B</item>')
    })

    it('should handle nested fragments', async () => {
      const node = createElement(
        'root',
        null,
        createElement(Fragment, null, createElement('a', null), createElement('b', null)),
      )
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<root><a/><b/></root>')
    })
  })

  describe('async components', () => {
    it('should resolve async components', async () => {
      const AsyncComponent = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return createElement('async', null, 'loaded')
      }

      const node = createElement(AsyncComponent, null)
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<async>loaded</async>')
    })

    it('should resolve multiple async components in parallel', async () => {
      const order: number[] = []

      const AsyncA = async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        order.push(1)
        return createElement('a', null)
      }

      const AsyncB = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push(2)
        return createElement('b', null)
      }

      const node = createElement(
        'root',
        null,
        createElement(AsyncA, null),
        createElement(AsyncB, null),
      )

      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<root><a/><b/></root>')
      // B should complete before A due to shorter timeout
      expect(order).toEqual([2, 1])
    })

    it('should handle nested async components', async () => {
      const Inner = async () => {
        return createElement('inner', null, 'content')
      }

      const Outer = async () => {
        return createElement('outer', null, createElement(Inner, null))
      }

      const node = createElement(Outer, null)
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<outer><inner>content</inner></outer>')
    })

    it('should pass props to async components', async () => {
      const AsyncGreeting = async ({ name }: { name: string }) => {
        return createElement('greeting', null, `Hello, ${name}!`)
      }

      const node = createElement(AsyncGreeting, { name: 'World' })
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<greeting>Hello, World!</greeting>')
    })
  })

  describe('CDATA support', () => {
    it('should render CDATA sections', async () => {
      const node = createElement(
        'description',
        null,
        CData({ children: 'Some <html> content & more' }),
      )
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<description><![CDATA[Some <html> content & more]]></description>')
    })

    it('should handle CDATA containing ]]>', async () => {
      const node = createElement('data', null, CData({ children: 'Before ]]> After' }))
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<data><![CDATA[Before ]]]]><![CDATA[> After]]></data>')
    })

    it('should handle multiple ]]> in CDATA', async () => {
      const node = createElement('data', null, CData({ children: 'A ]]> B ]]> C' }))
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<data><![CDATA[A ]]]]><![CDATA[> B ]]]]><![CDATA[> C]]></data>')
    })
  })

  describe('DangerouslyInsertRawXml support', () => {
    it('should insert raw XML without escaping', async () => {
      const htmlContent = '<p>Hello <strong>World</strong></p>'
      const node = createElement(
        'content',
        null,
        DangerouslyInsertRawXml({ children: htmlContent }),
      )
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<content><p>Hello <strong>World</strong></p></content>')
    })

    it('should handle complex raw XML', async () => {
      const rawXml = '<nested><element attr="value">text</element></nested>'
      const node = createElement('wrapper', null, DangerouslyInsertRawXml({ children: rawXml }))
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<wrapper><nested><element attr="value">text</element></nested></wrapper>')
    })
  })

  describe('pretty printing', () => {
    it('should format XML with indentation when pretty is true', async () => {
      const node = createElement(
        'root',
        null,
        createElement('child', null, createElement('grandchild', null)),
        createElement('child2', null),
      )
      const xml = await renderToXml(node, { declaration: false, pretty: true })
      expect(xml).toBe(`<root>
  <child>
    <grandchild/>
  </child>
  <child2/>
</root>
`)
    })

    it('should include declaration with newline when pretty', async () => {
      const node = createElement('root', null)
      const xml = await renderToXml(node, { pretty: true })
      expect(xml).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<root/>
`)
    })

    it('should keep text content inline', async () => {
      const node = createElement('root', null, createElement('title', null, 'Hello'))
      const xml = await renderToXml(node, { declaration: false, pretty: true })
      expect(xml).toBe(`<root>
  <title>Hello</title>
</root>
`)
    })
  })

  describe('sync components', () => {
    it('should render sync function components', async () => {
      const Greeting = ({ name }: { name: string }) =>
        createElement('greeting', null, `Hello, ${name}!`)

      const node = createElement(Greeting, { name: 'World' })
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<greeting>Hello, World!</greeting>')
    })

    it('should pass children to function components', async () => {
      const Wrapper = ({ children }: { children: any[] }) =>
        createElement('wrapper', null, ...children)

      const node = createElement(Wrapper, null, createElement('child', null))
      const xml = await renderToXml(node, { declaration: false })
      expect(xml).toBe('<wrapper><child/></wrapper>')
    })
  })

  describe('complex RSS-like structure', () => {
    it('should render a complete RSS-like structure', async () => {
      const node = createElement(
        'rss',
        { version: '2.0' },
        createElement(
          'channel',
          null,
          createElement('title', null, 'My Blog'),
          createElement('link', null, 'https://example.com'),
          createElement(
            'item',
            null,
            createElement('title', null, 'First Post'),
            createElement('link', null, 'https://example.com/post/1'),
            createElement('description', null, CData({ children: 'This has <html> in it' })),
          ),
          createElement(
            'item',
            null,
            createElement('title', null, 'Second Post'),
            createElement('link', null, 'https://example.com/post/2'),
          ),
        ),
      )

      const xml = await renderToXml(node)
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(xml).toContain('<rss version="2.0">')
      expect(xml).toContain('<title>My Blog</title>')
      expect(xml).toContain('<![CDATA[This has <html> in it]]>')
    })
  })
})
