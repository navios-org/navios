import { builder } from '@navios/builder'
import * as openapi from '@navios/openapi'
import { handler, NaviosFactory } from '@navios/server'
import { Controller, Module } from '@navios/server/legacy-compat'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { OpenApiDocument } from '@navios/openapi'
import type { NaviosApplication } from '@navios/server'

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

describe('@navios/openapi-bun', () => {
  it('re-exports @navios/openapi', () => {
    expect(legacy.openApiPlugin).toBe(openapi.openApiPlugin)
    expect(legacy.defineOpenApiPlugin).toBe(openapi.openApiPlugin)
    expect(legacy.ApiTag).toBe(openapi.ApiTag)
  })

  // The Bun adapter needs the Bun runtime; the plugin has no adapter-specific
  // code, so the in-memory adapter exercises the same routes.
  it('serves the document and the Scalar page through the re-exported plugin', async () => {
    class UsersController {
      getUser = handler(getUser, { attributes: [legacy.ApiSummary('Get a user')] }, () => ({
        id: '1',
      }))
    }
    Controller()(UsersController)
    class AppModule {}
    Module({ controllers: [UsersController] })(AppModule)

    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      plugins: [legacy.defineOpenApiPlugin({ info: { title: 'Bun API', version: '1.0.0' } })],
    })
    await app.init()

    const json = await app.inject({ method: 'GET', url: '/openapi.json' })
    const document = json.body as OpenApiDocument
    expect(document.paths['/users/{id}'].get.summary).toBe('Get a user')

    const docs = await app.inject({ method: 'GET', url: '/docs' })
    expect(docs.status).toBe(200)
    expect(docs.text).toContain('/openapi.json')
  })
})
