import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { builder } from '@navios/builder'
import { handler, NaviosFactory } from '@navios/core'
import { Controller, Module } from '@navios/core/legacy-compat'
import * as openapi from '@navios/openapi'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication } from '@navios/core'
import type { OpenApiDocument } from '@navios/openapi'

import * as legacy from '../index.mjs'

const api = builder()
const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({ id: z.string() }),
})

let app: NaviosApplication<any> | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('@navios/openapi-fastify', () => {
  it('re-exports @navios/openapi', () => {
    expect(legacy.openApiPlugin).toBe(openapi.openApiPlugin)
    expect(legacy.defineOpenApiPlugin).toBe(openapi.openApiPlugin)
    expect(legacy.ApiTag).toBe(openapi.ApiTag)
  })

  it('serves the document, YAML and the Scalar page on the Fastify adapter', async () => {
    class UsersController {
      getUser = handler(getUser, { attributes: [legacy.ApiSummary('Get a user')] }, () => ({
        id: '1',
      }))
    }
    Controller()(UsersController)
    class AppModule {}
    Module({ controllers: [UsersController] })(AppModule)

    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(),
      logger: false,
      globalPrefix: '/api',
      plugins: [
        legacy.defineOpenApiPlugin({
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
