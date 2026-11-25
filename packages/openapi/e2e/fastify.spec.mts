import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { builder } from '@navios/builder'
import { Controller, handler, Module, NaviosFactory } from '@navios/server'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication } from '@navios/server'

import { ApiSummary, openApiPlugin } from '../src/index.mjs'

import type { OpenApiDocument } from '../src/index.mjs'

// The plugin is adapter-neutral. This test runs it on the real Fastify
// adapter, through Fastify's own router and reply.

const api = builder()
const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({ id: z.string() }),
})

@Controller()
class UsersController {
  getUser = handler(getUser, { attributes: [ApiSummary('Get a user')] }, () => ({ id: '1' }))
}

@Module({ controllers: [UsersController] })
class AppModule {}

describe('openapi plugin on the Fastify adapter', () => {
  let app: NaviosApplication<any> | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  it('serves the document, YAML and the Scalar page', async () => {
    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(),
      logger: false,
      globalPrefix: '/api',
      plugins: [
        openApiPlugin({
          info: { title: 'Fastify API', version: '1.0.0' },
          disableYaml: false,
        }),
      ],
    })
    await app.init()

    const json = await app.inject({ method: 'GET', url: '/api/openapi.json' })
    expect(json.status).toBe(200)
    expect(json.headers['content-type']).toContain('application/json')
    const document = json.body as OpenApiDocument
    expect(Object.keys(document.paths)).toEqual(['/api/users/{id}'])
    expect(document.paths['/api/users/{id}'].get.summary).toBe('Get a user')

    const yaml = await app.inject({ method: 'GET', url: '/api/openapi.yaml' })
    expect(yaml.status).toBe(200)
    expect(yaml.headers['content-type']).toContain('text/yaml')
    expect(yaml.text).toContain('openapi: 3.1.0')

    const docs = await app.inject({ method: 'GET', url: '/api/docs' })
    expect(docs.status).toBe(200)
    expect(docs.headers['content-type']).toContain('text/html')
    expect(docs.text).toContain('/api/openapi.json')
  })
})
