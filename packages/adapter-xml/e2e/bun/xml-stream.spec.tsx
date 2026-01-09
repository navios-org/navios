import type { XmlComponent, XmlStreamParams } from '../../src/index.mjs'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  inject,
  Injectable,
  InjectableScope,
  Module,
  NaviosApplication,
  NaviosFactory,
  type EndpointParams,
} from '@navios/core'
import { defineBunEnvironment, type BunEnvironment } from '@navios/adapter-bun'

import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'

import {
  CData,
  Component,
  DangerouslyInsertRawXml,
  declareXmlStream,
  defineXmlEnvironment,
  XmlStream,
  createElement,
} from '../../src/index.mjs'

describe('XML Stream with Bun adapter', () => {
  let server: NaviosApplication<BunEnvironment>
  let serverUrl: string

  // Request scoped service for tracking
  @Injectable({
    scope: InjectableScope.Request,
  })
  class RequestTrackerService {
    private requestId: string = Math.random().toString(36).substring(7)

    getRequestId(): string {
      return this.requestId
    }
  }

  // Injectable data service
  @Injectable()
  class DataService {
    getItems() {
      return [
        { id: '1', title: 'First Item', description: 'Description 1' },
        { id: '2', title: 'Second Item', description: 'Description 2' },
        { id: '3', title: 'Third Item', description: 'Description 3' },
      ]
    }

    getItem(id: string) {
      return this.getItems().find((item) => item.id === id)
    }
  }

  // Class component with DI
  @Component()
  class ItemComponent implements XmlComponent {
    private dataService = inject(DataService)
    private tracker = inject(RequestTrackerService)

    constructor(private props: { id: string }) {}

    render() {
      const item = this.dataService.getItem(this.props.id)
      if (!item) {
        return createElement('error', null, 'Item not found')
      }
      return createElement(
        'item',
        { id: item.id, requestId: this.tracker.getRequestId() },
        createElement('title', null, item.title),
        createElement('description', null, item.description),
      )
    }
  }

  // Async component
  async function AsyncDataComponent({ delay }: { delay: number }) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    return createElement('async-data', null, `Loaded after ${delay}ms`)
  }

  // Simple RSS feed endpoint
  const getRssFeed = declareXmlStream({
    method: 'GET',
    url: '/feed.xml',
    querySchema: undefined,
    requestSchema: undefined,
    contentType: 'application/rss+xml',
    xmlDeclaration: true,
  })

  // Atom feed with query params
  const getAtomFeed = declareXmlStream({
    method: 'GET',
    url: '/atom.xml',
    querySchema: z.object({
      limit: z.coerce.number().optional().default(10),
    }),
    requestSchema: undefined,
    contentType: 'application/atom+xml',
    xmlDeclaration: true,
  })

  // Sitemap endpoint
  const getSitemap = declareXmlStream({
    method: 'GET',
    url: '/sitemap.xml',
    querySchema: undefined,
    requestSchema: undefined,
    contentType: 'application/xml',
    xmlDeclaration: true,
  })

  // Dynamic XML with URL params (use path without extension for Bun compatibility)
  const getItemXml = declareXmlStream({
    method: 'GET',
    url: '/items/$id',
    querySchema: undefined,
    requestSchema: undefined,
    contentType: 'application/xml',
    xmlDeclaration: true,
  })

  // POST endpoint for XML generation
  const postGenerateXml = declareXmlStream({
    method: 'POST',
    url: '/generate.xml',
    querySchema: undefined,
    requestSchema: z.object({
      title: z.string(),
      items: z.array(z.string()),
    }),
    contentType: 'application/xml',
    xmlDeclaration: true,
  })

  // Endpoint with async components
  const getAsyncXml = declareXmlStream({
    method: 'GET',
    url: '/async.xml',
    querySchema: undefined,
    requestSchema: undefined,
    contentType: 'application/xml',
    xmlDeclaration: true,
  })

  // Endpoint with class components (DI) - use path without extension for Bun compatibility
  const getDiXml = declareXmlStream({
    method: 'GET',
    url: '/di/$id',
    querySchema: undefined,
    requestSchema: undefined,
    contentType: 'application/xml',
    xmlDeclaration: true,
  })

  // Endpoint with CDATA and raw XML
  const getSpecialXml = declareXmlStream({
    method: 'GET',
    url: '/special.xml',
    querySchema: undefined,
    requestSchema: undefined,
    contentType: 'application/xml',
    xmlDeclaration: true,
  })

  // Also test regular JSON endpoint alongside XML
  const getJsonEndpoint = builder().declareEndpoint({
    method: 'GET',
    url: '/api/data',
    responseSchema: z.object({
      message: z.string(),
    }),
  })

  @Controller()
  class FeedController {
    private dataService = inject(DataService)
    private tracker = inject(RequestTrackerService)

    @XmlStream(getRssFeed)
    async getRssFeed(_params: XmlStreamParams<typeof getRssFeed>) {
      const items = this.dataService.getItems()
      return (
        <rss version="2.0">
          <channel>
            <title>My Blog</title>
            <link>https://example.com</link>
            <description>A sample RSS feed</description>
            {items.map((item) => (
              <item key={item.id}>
                <title>{item.title}</title>
                <link>https://example.com/items/{item.id}</link>
                <description>{item.description}</description>
              </item>
            ))}
          </channel>
        </rss>
      )
    }

    @XmlStream(getAtomFeed)
    async getAtomFeed(params: XmlStreamParams<typeof getAtomFeed>) {
      const limit = params.params.limit
      const items = this.dataService.getItems().slice(0, limit)
      return (
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>My Atom Feed</title>
          <link href="https://example.com/atom.xml" rel="self" />
          <id>https://example.com/</id>
          <updated>2025-01-01T00:00:00Z</updated>
          {items.map((item) => (
            <entry key={item.id}>
              <title>{item.title}</title>
              <id>https://example.com/items/{item.id}</id>
              <updated>2025-01-01T00:00:00Z</updated>
              <summary>{item.description}</summary>
            </entry>
          ))}
        </feed>
      )
    }

    @XmlStream(getSitemap)
    async getSitemap(_params: XmlStreamParams<typeof getSitemap>) {
      const items = this.dataService.getItems()
      return (
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/</loc>
            <lastmod>2025-01-01</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          {items.map((item) => (
            <url key={item.id}>
              <loc>https://example.com/items/{item.id}</loc>
              <lastmod>2025-01-01</lastmod>
              <changefreq>weekly</changefreq>
              <priority>0.8</priority>
            </url>
          ))}
        </urlset>
      )
    }

    @XmlStream(getItemXml)
    async getItemXml(params: XmlStreamParams<typeof getItemXml>) {
      const item = this.dataService.getItem(params.urlParams.id as string)
      if (!item) {
        return (
          <error>
            <message>Item not found</message>
            <requestedId>{params.urlParams.id}</requestedId>
          </error>
        )
      }
      return (
        <item id={item.id}>
          <title>{item.title}</title>
          <description>{item.description}</description>
        </item>
      )
    }

    @XmlStream(postGenerateXml)
    async postGenerateXml(params: XmlStreamParams<typeof postGenerateXml>) {
      const { title, items } = params.data
      return (
        <generated>
          <title>{title}</title>
          <items count={String(items.length)}>
            {items.map((item, index) => (
              <item index={String(index)} key={index}>
                {item}
              </item>
            ))}
          </items>
        </generated>
      )
    }

    @XmlStream(getAsyncXml)
    async getAsyncXml(_params: XmlStreamParams<typeof getAsyncXml>) {
      return (
        <root>
          <sync>Immediate content</sync>
          <AsyncDataComponent delay={10} />
          <AsyncDataComponent delay={5} />
        </root>
      )
    }

    @XmlStream(getDiXml)
    async getDiXml(params: XmlStreamParams<typeof getDiXml>) {
      return (
        <root requestId={this.tracker.getRequestId()}>
          <ItemComponent id={params.urlParams.id as string} />
        </root>
      )
    }

    @XmlStream(getSpecialXml)
    async getSpecialXml(_params: XmlStreamParams<typeof getSpecialXml>) {
      return (
        <root>
          <cdata-example>
            <CData>
              {'This is <raw> HTML & XML content that should not be escaped'}
            </CData>
          </cdata-example>
          <raw-xml-example>
            <DangerouslyInsertRawXml>
              {'<nested><element attr="value">text</element></nested>'}
            </DangerouslyInsertRawXml>
          </raw-xml-example>
          <escaped>{'<this> & "that" should be escaped'}</escaped>
        </root>
      )
    }

    @Endpoint(getJsonEndpoint)
    async getJsonData(_params: EndpointParams<typeof getJsonEndpoint>) {
      return { message: 'JSON endpoint works alongside XML' }
    }
  }

  @Module({
    controllers: [FeedController],
  })
  class AppModule {}

  beforeAll(async () => {
    server = await NaviosFactory.create<BunEnvironment>(AppModule, {
      adapter: [defineBunEnvironment(), defineXmlEnvironment()],
    })
    await server.init()
    await server.listen({ port: 3008, hostname: 'localhost' })
    serverUrl = server.getServer().url.href.replace(/\/$/, '')
  })

  afterAll(async () => {
    await server.close()
  })

  describe('Basic XML endpoints', () => {
    it('should return RSS feed with correct content type', async () => {
      const response = await supertest(serverUrl).get('/feed.xml')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/rss+xml')
      expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(response.text).toContain('<rss version="2.0">')
      expect(response.text).toContain('<title>My Blog</title>')
      expect(response.text).toContain('<item>')
      expect(response.text).toContain('<title>First Item</title>')
    })

    it('should return Atom feed with query params', async () => {
      const response = await supertest(serverUrl).get('/atom.xml?limit=2')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/atom+xml')
      expect(response.text).toContain(
        '<feed xmlns="http://www.w3.org/2005/Atom">',
      )

      // Count entries - should be limited to 2
      const entryCount = (response.text.match(/<entry>/g) || []).length
      expect(entryCount).toBe(2)
    })

    it('should return sitemap XML', async () => {
      const response = await supertest(serverUrl).get('/sitemap.xml')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/xml')
      expect(response.text).toContain(
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      )
      expect(response.text).toContain('<loc>https://example.com/</loc>')
      expect(response.text).toContain('<priority>1.0</priority>')
    })
  })

  describe('URL parameters', () => {
    it('should handle URL parameters in XML endpoint', async () => {
      const response = await supertest(serverUrl).get('/items/1')

      expect(response.status).toBe(200)
      expect(response.text).toContain('<item id="1">')
      expect(response.text).toContain('<title>First Item</title>')
    })

    it('should handle non-existent item', async () => {
      const response = await supertest(serverUrl).get('/items/999')

      expect(response.status).toBe(200)
      expect(response.text).toContain('<error>')
      expect(response.text).toContain('<message>Item not found</message>')
      expect(response.text).toContain('<requestedId>999</requestedId>')
    })
  })

  describe('POST with request body', () => {
    it('should generate XML from POST body', async () => {
      const response = await supertest(serverUrl)
        .post('/generate.xml')
        .send({
          title: 'Generated Document',
          items: ['Alpha', 'Beta', 'Gamma'],
        })

      expect(response.status).toBe(200)
      expect(response.text).toContain('<generated>')
      expect(response.text).toContain('<title>Generated Document</title>')
      expect(response.text).toContain('<items count="3">')
      expect(response.text).toContain('<item index="0">Alpha</item>')
      expect(response.text).toContain('<item index="1">Beta</item>')
      expect(response.text).toContain('<item index="2">Gamma</item>')
    })
  })

  describe('Async components', () => {
    it('should resolve async components in XML', async () => {
      const response = await supertest(serverUrl).get('/async.xml')

      expect(response.status).toBe(200)
      expect(response.text).toContain('<sync>Immediate content</sync>')
      expect(response.text).toContain(
        '<async-data>Loaded after 10ms</async-data>',
      )
      expect(response.text).toContain(
        '<async-data>Loaded after 5ms</async-data>',
      )
    })
  })

  describe('Class components with DI', () => {
    it('should render class components with injected services', async () => {
      const response = await supertest(serverUrl).get('/di/1')

      expect(response.status).toBe(200)
      expect(response.text).toContain('<root requestId=')
      expect(response.text).toContain('<item id="1"')
      expect(response.text).toContain('<title>First Item</title>')
    })

    it('should isolate request-scoped services across parallel requests', async () => {
      const requests = [
        supertest(serverUrl).get('/di/1'),
        supertest(serverUrl).get('/di/2'),
        supertest(serverUrl).get('/di/3'),
      ]

      const responses = await Promise.all(requests)

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200)
      })

      // Extract request IDs from the responses
      const requestIds = responses.map((response) => {
        const match = response.text.match(/requestId="([^"]+)"/)
        return match ? match[1] : null
      })

      // All request IDs should be unique
      const uniqueIds = new Set(requestIds.filter(Boolean))
      expect(uniqueIds.size).toBe(3)
    })
  })

  describe('Special XML content', () => {
    it('should handle CDATA and raw XML correctly', async () => {
      const response = await supertest(serverUrl).get('/special.xml')

      expect(response.status).toBe(200)

      // CDATA should preserve raw content
      expect(response.text).toContain(
        '<![CDATA[This is <raw> HTML & XML content that should not be escaped]]>',
      )

      // Raw XML should be inserted without escaping
      expect(response.text).toContain(
        '<nested><element attr="value">text</element></nested>',
      )

      // Regular content should be escaped
      expect(response.text).toContain(
        '&lt;this&gt; &amp; "that" should be escaped',
      )
    })
  })

  describe('Mixed endpoints', () => {
    it('should work alongside regular JSON endpoints', async () => {
      const xmlResponse = await supertest(serverUrl).get('/feed.xml')
      const jsonResponse = await supertest(serverUrl).get('/api/data')

      expect(xmlResponse.status).toBe(200)
      expect(xmlResponse.headers['content-type']).toContain(
        'application/rss+xml',
      )

      expect(jsonResponse.status).toBe(200)
      expect(jsonResponse.body.message).toBe(
        'JSON endpoint works alongside XML',
      )
    })
  })

  describe('Fragment support', () => {
    it('should correctly render fragments within XML', async () => {
      // The RSS feed uses fragments implicitly with array mapping
      const response = await supertest(serverUrl).get('/feed.xml')

      expect(response.status).toBe(200)
      // Multiple items should be rendered without extra wrapper
      const itemCount = (response.text.match(/<item>/g) || []).length
      expect(itemCount).toBeGreaterThan(1)
    })
  })
})
