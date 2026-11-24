import { builder } from '@navios/builder'
import { Controller, extractControllerMetadata, XmlStreamAdapterToken } from '@navios/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { declareXmlStream } from '../handlers/xml-stream.mjs'

import { XmlStream } from './xml-stream.decorator.mjs'

describe('@XmlStream decorator', () => {
  const api = builder()

  it('should serve a declareXmlStream declaration, which carries no response kind', () => {
    const feed = declareXmlStream({
      method: 'GET',
      url: '/feed.xml',
      querySchema: z.object({ page: z.string().optional() }),
      contentType: 'application/rss+xml',
    })

    @Controller()
    class FeedController {
      @XmlStream(feed)
      async getFeed() {
        return null
      }
    }

    const [handler] = extractControllerMetadata(FeedController).endpoints
    expect(feed.config).not.toHaveProperty('response')
    expect(handler.config).toBe(feed.config)
    expect(handler.adapterToken).toBe(XmlStreamAdapterToken)
    expect(handler.successStatusCode).toBe(200)
  })

  it('should serve builder declarations that read the reply as text, blob or stream', () => {
    const asText = api.declareEndpoint({ method: 'GET', url: '/a.xml', response: 'text' })
    const asBlob = api.declareEndpoint({ method: 'GET', url: '/b.xml', response: 'blob' })
    const asStream = api.declareEndpoint({ method: 'GET', url: '/c.xml', response: 'stream' })

    expect(() => {
      class Test {
        @XmlStream(asText)
        async a() {}

        @XmlStream(asBlob)
        async b() {}

        @XmlStream(asStream)
        async c() {}
      }
      return Test
    }).not.toThrow()
  })

  it('should reject a JSON declaration', () => {
    const json = api.declareEndpoint({
      method: 'GET',
      url: '/json',
      response: 'json',
      responseSchema: z.object({ ok: z.boolean() }),
    })

    expect(() => {
      class Test {
        // @ts-expect-error - response: 'json' cannot be served as XML
        @XmlStream(json)
        async get() {}
      }
      return Test
    }).toThrow(
      "[Navios] @XmlStream cannot serve GET /json: the endpoint is declared with response: 'json', but @XmlStream answers with an XML document",
    )
  })

  it('should reject a void declaration', () => {
    const remove = api.declareEndpoint({ method: 'DELETE', url: '/items/$id', response: 'void' })

    expect(() => {
      class Test {
        // @ts-expect-error - response: 'void' cannot be served as XML
        @XmlStream(remove)
        async remove() {}
      }
      return Test
    }).toThrow(
      "@XmlStream cannot serve DELETE /items/$id: the endpoint is declared with response: 'void'",
    )
  })

  it('should reject a multipart declaration', () => {
    expect(() => {
      const upload = declareXmlStream({
        method: 'POST',
        url: '/upload.xml',
        // @ts-expect-error - XML endpoints read JSON bodies only
        body: 'multipart',
      })

      class Test {
        @XmlStream(upload)
        async upload() {}
      }
      return Test
    }).toThrow(
      "[Navios] @XmlStream cannot serve POST /upload.xml: the endpoint is declared with body: 'multipart', but @XmlStream needs body: 'json' (or no body option).",
    )
  })
})
