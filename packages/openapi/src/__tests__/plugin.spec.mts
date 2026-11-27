import { builder } from '@navios/builder'
import { Controller, handler, Module, NaviosFactory } from '@navios/server'
import { createTestClient, defineInMemoryEnvironment } from '@navios/server/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod/v4'

import type { LoggerService, RouteInfo, StandardSchemaV1 } from '@navios/server'

import { ApiSummary, ApiTag, openApiPlugin } from '../index.mjs'

import type { OpenApiDocument } from '../index.mjs'

import { closeApps, createApp } from './helpers.mjs'

const api = builder()
const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({ id: z.string(), name: z.string() }),
})
const info = { title: 'My API', version: '2.0.0' }

@ApiTag('Users')
@Controller()
class UsersController {
  @ApiSummary('Get a user')
  getUser = handler(getUser, ({ urlParams }) => ({ id: String(urlParams.id), name: 'Ann' }))
}

function recordingLogger() {
  const logger = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    fatal: vi.fn(),
  }
  return logger as typeof logger & LoggerService
}

afterEach(closeApps)

describe('openApiPlugin', () => {
  it('serves the document as JSON at /openapi.json', async () => {
    const app = await createApp([UsersController], { plugins: [openApiPlugin({ info })] })

    const response = await app.inject({ method: 'GET', url: '/openapi.json' })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    const document = response.body as OpenApiDocument
    expect(document.openapi).toBe('3.1.0')
    expect(document.info).toEqual(info)
    expect(document.tags).toEqual([{ name: 'Users' }])
    expect(document.paths['/users/{id}'].get).toMatchObject({
      tags: ['Users'],
      summary: 'Get a user',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    })
  })

  it('does not document its own routes', async () => {
    const app = await createApp([UsersController], {
      plugins: [openApiPlugin({ info, yaml: true })],
    })

    const paths = app.routes().map((route: RouteInfo) => route.path)
    expect(paths).toEqual(expect.arrayContaining(['/openapi.json', '/openapi.yaml', '/docs']))
    const document = (await app.inject({ method: 'GET', url: '/openapi.json' }))
      .body as OpenApiDocument
    expect(Object.keys(document.paths)).toEqual(['/users/{id}'])
  })

  it('keeps the application routes working, through the typed test client', async () => {
    const app = await createApp([UsersController], { plugins: [openApiPlugin({ info })] })

    const response = await createTestClient(app)(getUser, { urlParams: { id: '7' } })
    expect(response.body).toEqual({ id: '7', name: 'Ann' })
  })

  it('serves the Scalar page at /docs, pointing at the JSON document', async () => {
    const app = await createApp([UsersController], {
      plugins: [
        openApiPlugin({ info, scalar: { theme: 'purple', metaData: { title: 'Reference' } } }),
      ],
    })

    const response = await app.inject({ method: 'GET', url: '/docs' })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(response.text).toContain('<!doctype html>')
    expect(response.text).toContain('<title>Reference</title>')
    expect(response.text).toContain('/openapi.json')
    expect(response.text).toContain('purple')
  })

  it('does not serve YAML unless enabled', async () => {
    const app = await createApp([UsersController], { plugins: [openApiPlugin({ info })] })
    expect((await app.inject({ method: 'GET', url: '/openapi.yaml' })).status).toBe(404)
  })

  it('serves the document as YAML when enabled', async () => {
    const app = await createApp([UsersController], {
      plugins: [openApiPlugin({ info, yaml: true })],
    })

    const response = await app.inject({ method: 'GET', url: '/openapi.yaml' })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/yaml; charset=utf-8')
    const json = (await app.inject({ method: 'GET', url: '/openapi.json' })).body
    expect(parseYaml(response.text)).toEqual(json)
  })

  it('honours custom paths', async () => {
    const app = await createApp([UsersController], {
      plugins: [
        openApiPlugin({
          info,
          jsonPath: '/spec/api.json',
          yamlPath: '/spec/api.yaml',
          docsPath: '/reference',
          yaml: true,
        }),
      ],
    })

    expect((await app.inject({ method: 'GET', url: '/spec/api.json' })).status).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/spec/api.yaml' })).status).toBe(200)
    const docs = await app.inject({ method: 'GET', url: '/reference' })
    expect(docs.text).toContain('/spec/api.json')
    expect((await app.inject({ method: 'GET', url: '/openapi.json' })).status).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/docs' })).status).toBe(404)
  })

  it('takes a path with or without slashes around it', async () => {
    for (const [docsPath, jsonPath, yamlPath, globalPrefix, docs, json, yaml] of [
      ['docs', 'openapi.json', 'openapi.yaml', '', '/docs', '/openapi.json', '/openapi.yaml'],
      ['/ref/', '/spec/api/', 'a/b', '', '/ref', '/spec/api', '/a/b'],
      ['docs/', 'openapi.json', '/y', 'v1', '/v1/docs', '/v1/openapi.json', '/v1/y'],
      ['/', 'j', 'y', '', '/', '/j', '/y'],
      ['', 'j', 'y', '/api', '/api', '/api/j', '/api/y'],
    ]) {
      const app = await createApp([UsersController], {
        globalPrefix,
        plugins: [openApiPlugin({ info, docsPath, jsonPath, yamlPath, yaml: true })],
      })
      const paths = app.routes().map((route: RouteInfo) => route.path)
      expect(paths).toEqual(expect.arrayContaining([docs, json, yaml]))
      const page = await app.inject({ method: 'GET', url: docs })
      expect(page.status).toBe(200)
      expect(page.text).toContain(`"${json}"`)
    }
  })

  it('can disable the Scalar page and the JSON route', async () => {
    const app = await createApp([UsersController], {
      plugins: [openApiPlugin({ info, scalar: false, json: false, yaml: true })],
    })

    expect((await app.inject({ method: 'GET', url: '/docs' })).status).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/openapi.json' })).status).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/openapi.yaml' })).status).toBe(200)
  })

  it('serves the Scalar page for scalar: true and for an options object', async () => {
    for (const scalar of [true, { theme: 'moon' }] as const) {
      const app = await createApp([UsersController], {
        plugins: [openApiPlugin({ info, scalar })],
      })
      expect((await app.inject({ method: 'GET', url: '/docs' })).status).toBe(200)
    }
  })

  it('embeds the document in the Scalar page when the JSON route is disabled', async () => {
    const app = await createApp([UsersController], {
      plugins: [openApiPlugin({ info, json: false })],
    })

    const docs = await app.inject({ method: 'GET', url: '/docs' })
    expect(docs.status).toBe(200)
    expect(docs.text).toContain('My API')
    expect(docs.text).not.toContain('/openapi.json')
  })

  it('puts its routes and the documented paths under the global prefix', async () => {
    const app = await createApp([UsersController], {
      globalPrefix: '/api',
      plugins: [openApiPlugin({ info })],
    })

    expect((await app.inject({ method: 'GET', url: '/openapi.json' })).status).toBe(404)
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' })
    expect(Object.keys((response.body as OpenApiDocument).paths)).toEqual(['/api/users/{id}'])
    const docs = await app.inject({ method: 'GET', url: '/api/docs' })
    expect(docs.text).toContain('/api/openapi.json')
  })

  it('passes document options through', async () => {
    const app = await createApp([UsersController], {
      plugins: [
        openApiPlugin({
          info,
          servers: [{ url: 'https://api.example.com' }],
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
          security: [{ bearerAuth: [] }],
          externalDocs: { url: 'https://docs.example.com' },
          tags: [{ name: 'Users', description: 'User operations' }],
        }),
      ],
    })

    const document = (await app.inject({ method: 'GET', url: '/openapi.json' })).body
    expect(document).toMatchObject({
      servers: [{ url: 'https://api.example.com' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
      security: [{ bearerAuth: [] }],
      externalDocs: { url: 'https://docs.example.com' },
      tags: [{ name: 'Users', description: 'User operations' }],
    })
  })

  it('lets transformDocument change the served document', async () => {
    const app = await createApp([UsersController], {
      plugins: [
        openApiPlugin({
          info,
          transformDocument: (document, routes) => ({
            ...document,
            info: { ...document.info, description: `${routes.length} routes` },
          }),
        }),
      ],
    })

    const document = (await app.inject({ method: 'GET', url: '/openapi.json' }))
      .body as OpenApiDocument
    // The user route plus /openapi.json and /docs.
    expect(document.info.description).toBe('3 routes')
  })

  it('can be registered with app.usePlugin', async () => {
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    app.usePlugin(openApiPlugin({ info }))
    await app.init()

    const response = await app.inject({ method: 'GET', url: '/openapi.json' })
    expect(Object.keys((response.body as OpenApiDocument).paths)).toEqual(['/users/{id}'])
    await app.close()
  })

  describe('a schema library without the Standard JSON Schema extension', () => {
    const plain: StandardSchemaV1<{ id: string }, { id: string }> = {
      '~standard': {
        version: 1,
        vendor: 'hand-written',
        validate: (value) => ({ value: value as { id: string } }),
      },
    }
    const getThing = api.declareEndpoint({ method: 'GET', url: '/things', responseSchema: plain })

    @Controller()
    class ThingsController {
      getThing = handler(getThing, () => ({ id: '1' }))
    }

    it('uses the toJsonSchema option', async () => {
      const logger = recordingLogger()
      const app = await createApp([ThingsController], {
        logger,
        plugins: [
          openApiPlugin({
            info,
            toJsonSchema: (schema, io) =>
              schema === plain ? { type: 'object', title: `Thing (${io})` } : undefined,
          }),
        ],
      })

      const document = (await app.inject({ method: 'GET', url: '/openapi.json' }))
        .body as OpenApiDocument
      expect(document.paths['/things'].get.responses['200'].content).toEqual({
        'application/json': { schema: { type: 'object', title: 'Thing (output)' } },
      })
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('documents an unconstrained schema and warns once at init, naming the endpoint', async () => {
      const logger = recordingLogger()
      const app = await createApp([ThingsController], {
        logger,
        plugins: [openApiPlugin({ info })],
      })

      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn.mock.calls[0].join(' ')).toContain(
        'GET /things (ThingsController.getThing)',
      )

      const document = (await app.inject({ method: 'GET', url: '/openapi.json' }))
        .body as OpenApiDocument
      expect(document.paths['/things'].get.responses['200'].content).toEqual({
        'application/json': { schema: {} },
      })
      await app.inject({ method: 'GET', url: '/openapi.json' })
      expect(logger.warn).toHaveBeenCalledTimes(1)
    })
  })
})
