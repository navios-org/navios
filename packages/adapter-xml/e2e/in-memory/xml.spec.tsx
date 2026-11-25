import { builder } from '@navios/builder'
import { Controller, handler, Module, NaviosFactory } from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { NaviosApplication, RequestContext } from '@navios/server'

import { renderToXml, xml, xmlPlugin } from '../../src/index.mjs'
import { defineXmlSuite } from '../suite.mjs'

defineXmlSuite('the in-memory adapter', () => defineInMemoryEnvironment(), {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
})

describe('xmlPlugin', () => {
  const api = builder()
  const getDoc = api.declareEndpoint({ method: 'GET', url: '/doc.xml', response: 'text' })
  const getManual = api.declareEndpoint({ method: 'GET', url: '/manual.xml', response: 'text' })

  function Agent(_props: {}, ctx: RequestContext) {
    return <agent>{ctx.headers.get('user-agent')}</agent>
  }

  @Controller()
  class DocController {
    doc = handler(getDoc, () =>
      xml(
        <doc>
          <a />
        </doc>,
      ),
    )

    overridden = handler(
      api.declareEndpoint({ method: 'GET', url: '/overridden.xml', response: 'text' }),
      () => xml(<doc />, { contentType: 'application/xml', pretty: false, declaration: true }),
    )

    // Without the plugin: render in the handler and return the string.
    manual = handler(getManual, async (_params, ctx) => {
      ctx.reply.header('content-type', 'application/xml; charset=utf-8')
      return renderToXml(<Agent />, { ctx })
    })
  }

  @Module({ controllers: [DocController] })
  class DocModule {}

  const apps: NaviosApplication<any>[] = []

  async function createApp(plugins: ReturnType<typeof xmlPlugin>[]) {
    const app = await NaviosFactory.create(DocModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      plugins,
    })
    apps.push(app)
    await app.init()
    return app
  }

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()!.close()
    }
  })

  it('applies its options as defaults for every xml() response', async () => {
    const app = await createApp([
      xmlPlugin({ contentType: 'text/xml', pretty: true, declaration: false }),
    ])

    const response = await app.inject({ method: 'GET', url: '/doc.xml' })

    expect(response.headers['content-type']).toBe('text/xml; charset=utf-8')
    expect(response.text).toBe('<doc>\n  <a/>\n</doc>\n')
  })

  it('lets options passed to xml() win over its defaults', async () => {
    const app = await createApp([
      xmlPlugin({ contentType: 'text/xml', pretty: true, declaration: false }),
    ])

    const response = await app.inject({ method: 'GET', url: '/overridden.xml' })

    expect(response.headers['content-type']).toBe('application/xml; charset=utf-8')
    expect(response.text).toBe('<?xml version="1.0" encoding="UTF-8"?><doc/>')
  })

  it('is not needed for a handler that renders with renderToXml itself', async () => {
    const app = await createApp([])

    const response = await app.inject({
      method: 'GET',
      url: '/manual.xml',
      headers: { 'user-agent': 'vitest' },
    })

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/xml; charset=utf-8')
    expect(response.text).toBe('<?xml version="1.0" encoding="UTF-8"?><agent>vitest</agent>')
  })
})
