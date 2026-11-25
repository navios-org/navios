import { NaviosFactory } from '@navios/server'

import type { NaviosApplication } from '@navios/server'
import type { AdapterDefinition } from '@navios/server/adapter'

import { xmlPlugin } from '../src/index.mjs'

import { AppModule } from './app.jsx'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The test API of the runner in use (vitest, or bun:test for the Bun adapter). */
interface TestApi {
  describe: (name: string, fn: () => void) => void
  it: (name: string, fn: () => Promise<void> | void) => void
  expect: (value: any) => any
  beforeAll: (fn: () => Promise<void>) => void
  afterAll: (fn: () => Promise<void>) => void
}

/**
 * The behaviour of `xml()` responses, identical on every adapter.
 */
export function defineXmlSuite(
  name: string,
  adapter: () => AdapterDefinition<any>,
  { describe, it, expect, beforeAll, afterAll }: TestApi,
): void {
  describe(`xml() responses on ${name}`, () => {
    let app: NaviosApplication<any>
    const get = (url: string, headers?: Record<string, string>) =>
      app.inject({ method: 'GET', url, headers })

    beforeAll(async () => {
      app = await NaviosFactory.create(AppModule, {
        adapter: adapter(),
        plugins: [xmlPlugin()],
        logger: false,
        requestScopedServices: 'allow',
      })
      await app.init()
    })

    afterAll(async () => {
      await app.close()
    })

    describe('basic XML endpoints', () => {
      it('returns an RSS feed with the content type given to xml()', async () => {
        const response = await get('/feed.xml')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toBe('application/rss+xml; charset=utf-8')
        expect(response.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
        expect(response.text).toContain('<rss version="2.0">')
        expect(response.text).toContain('<title>My Blog</title>')
        expect(response.text).toContain('<title>First Item</title>')
      })

      it('returns an Atom feed using validated query params', async () => {
        const response = await get('/atom.xml?limit=2')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toContain('application/atom+xml')
        expect(response.text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
        expect(response.text).toContain(
          '<atom:link href="https://example.com/atom.xml" rel="self"/>',
        )
        expect((response.text.match(/<entry>/g) || []).length).toBe(2)
      })

      it('uses application/xml with a utf-8 charset by default', async () => {
        const response = await get('/sitemap.xml')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toBe('application/xml; charset=utf-8')
        expect(response.text).toContain(
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        )
        expect(response.text).toContain('<priority>1.0</priority>')
      })

      it('renders arrays of elements without a wrapper', async () => {
        const response = await get('/feed.xml')

        expect((response.text.match(/<item>/g) || []).length).toBe(3)
      })
    })

    describe('request data', () => {
      it('handles URL parameters', async () => {
        const response = await get('/items/1')

        expect(response.status).toBe(200)
        expect(response.text).toContain('<item id="1">')
        expect(response.text).toContain('<title>First Item</title>')
      })

      it('handles a missing item', async () => {
        const response = await get('/items/999')

        expect(response.status).toBe(200)
        expect(response.text).toContain('<message>Item not found</message>')
        expect(response.text).toContain('<requestedId>999</requestedId>')
      })

      it('generates XML from a POST body', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/generate.xml',
          body: { title: 'Generated Document', items: ['Alpha', 'Beta', 'Gamma'] },
        })

        expect(response.status).toBe(200)
        expect(response.text).toContain('<title>Generated Document</title>')
        expect(response.text).toContain('<items count="3">')
        expect(response.text).toContain('<item index="0">Alpha</item>')
        expect(response.text).toContain('<item index="2">Gamma</item>')
      })

      it('rejects an invalid body before the handler runs', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/generate.xml',
          body: { title: 1 },
        })

        expect(response.status).toBe(400)
        expect(response.headers['content-type']).toContain('application/problem+json')
      })
    })

    describe('components', () => {
      it('resolves async function components', async () => {
        const response = await get('/async.xml')

        expect(response.status).toBe(200)
        expect(response.text).toContain(
          '<sync>Immediate content</sync>' +
            '<async-data>Loaded after 10ms</async-data>' +
            '<async-data>Loaded after 5ms</async-data>',
        )
      })

      it('builds class components through DI, with props and injected singletons', async () => {
        const response = await get('/di/1')

        expect(response.status).toBe(200)
        expect(response.text).toContain('<item id="1"')
        expect(response.text).toContain('<title>First Item</title>')
      })

      it('validates class component props against the schema', async () => {
        const valid = await get('/badge?count=5')
        expect(valid.status).toBe(200)
        expect(valid.text).toContain('<badge>5</badge>')

        const invalid = await get('/badge?count=-1')
        expect(invalid.status).toBe(500)
        expect(invalid.headers['content-type']).toContain('application/problem+json')
      })

      it('gives components the request context: request values and context keys', async () => {
        const response = await get('/context.xml', { 'accept-language': 'uk', 'x-user': 'ann' })

        expect(response.status).toBe(200)
        expect(response.text).toContain('<root><locale>uk</locale><user>ann</user></root>')
      })

      it('shares a request-scoped service between handler and component, one per request', async () => {
        const responses = await Promise.all([get('/di/1'), get('/di/2'), get('/di/3')])

        const ids = responses.map((response) => {
          expect(response.status).toBe(200)
          const [root, item] = [...response.text.matchAll(/requestId="([^"]+)"/g)].map((m) => m[1])
          // The handler and the component saw the same instance.
          expect(root).toBeDefined()
          expect(item).toBe(root)
          return root
        })
        expect(new Set(ids).size).toBe(3)
      })
    })

    describe('errors while rendering', () => {
      it('maps an HttpException thrown by a component like a handler error', async () => {
        const response = await get('/missing.xml')

        expect(response.status).toBe(404)
        expect(response.headers['content-type']).toContain('application/problem+json')
        expect((response.body as any).detail).toBe('No such document')
      })

      it('answers 500 without leaking the message when a component throws', async () => {
        const response = await get('/explode.xml')

        expect(response.status).toBe(500)
        expect(response.headers['content-type']).toContain('application/problem+json')
        expect(response.text).not.toContain('component exploded')
      })

      it('answers 500 when a defineTag schema rejects the props', async () => {
        const response = await get('/bad-tag.xml')

        expect(response.status).toBe(500)
      })
    })

    describe('special XML content', () => {
      it('handles CDATA, raw XML and escaping', async () => {
        const response = await get('/special.xml')

        expect(response.status).toBe(200)
        expect(response.text).toContain(
          '<![CDATA[This is <raw> HTML & XML content that should not be escaped]]>',
        )
        expect(response.text).toContain('<nested><element attr="value">text</element></nested>')
        expect(response.text).toContain('&lt;this&gt; &amp; "that" should be escaped')
      })
    })

    describe('response options', () => {
      it("serves an endpoint declared with response: 'stream'", async () => {
        const response = await get('/stream.xml')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toBe('application/xml; charset=utf-8')
        expect(response.text).toBe('<?xml version="1.0" encoding="UTF-8"?><streamed>ok</streamed>')
      })

      it("serves an endpoint declared with response: 'blob'", async () => {
        const response = await get('/blob.xml')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toBe('application/xml; charset=utf-8')
        expect(response.text).toBe('<?xml version="1.0" encoding="UTF-8"?><blobbed>ok</blobbed>')
      })

      it('applies declaration, pretty, status and contentType passed to xml()', async () => {
        const response = await get('/options.xml')

        expect(response.status).toBe(203)
        expect(response.headers['content-type']).toBe('text/xml; charset=UTF-8')
        expect(response.text).toBe('<root>\n  <child/>\n</root>\n')
      })

      it('keeps headers and cookies set through ctx.reply', async () => {
        const response = await get('/headers.xml')

        expect(response.status).toBe(200)
        expect(response.headers['cache-control']).toBe('max-age=60')
        expect(String(response.headers['set-cookie'])).toContain('seen=1')
        expect(response.headers['content-type']).toBe('application/xml; charset=utf-8')
      })
    })

    describe('other endpoints', () => {
      it('leaves text endpoints that return a string alone', async () => {
        const response = await get('/plain.txt')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toContain('text/plain')
        expect(response.text).toBe('just text')
      })

      it('works alongside JSON endpoints', async () => {
        const response = await get('/api/data')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({ message: 'JSON endpoint works alongside XML' })
      })
    })
  })
}
