import { builder } from '@navios/builder'
import { Controller, Endpoint, handler, Module } from '@navios/core'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { RouteInfo } from '@navios/core'

import {
  ApiDeprecated,
  ApiDeprecatedToken,
  ApiExclude,
  ApiExcludeToken,
  ApiOperation,
  ApiOperationToken,
  ApiSecurity,
  ApiSecurityToken,
  ApiStream,
  ApiStreamToken,
  ApiSummary,
  ApiSummaryToken,
  ApiTag,
  ApiTagToken,
  extractOpenApiMetadata,
} from '../index.mjs'

import { closeApps, createApp, createAppFromModule } from './helpers.mjs'

const api = builder()
const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({ id: z.string() }),
})
const listUsers = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(z.object({ id: z.string() })),
})

async function routeOf(controller: new () => unknown, handlerName: string): Promise<RouteInfo> {
  const app = await createApp([controller])
  const route = app.routes().find((item: RouteInfo) => item.handlerName === handlerName)
  if (!route) {
    throw new Error(`no route ${handlerName}`)
  }
  return route
}

afterEach(closeApps)

describe('documentation attributes', () => {
  describe('ApiTag', () => {
    it('stores the tag on a controller', async () => {
      @ApiTag('Users', 'User management operations')
      @Controller()
      class TestController {
        @Endpoint(getUser)
        async getUser() {
          return { id: '1' }
        }
      }

      const route = await routeOf(TestController, 'getUser')
      expect(route.attributes.controller.get(ApiTagToken)).toEqual({
        name: 'Users',
        description: 'User management operations',
      })
    })

    it('works with just a name', async () => {
      @ApiTag('Users')
      @Controller()
      class TestController {
        @Endpoint(getUser)
        async getUser() {
          return { id: '1' }
        }
      }

      const route = await routeOf(TestController, 'getUser')
      expect(route.attributes.controller.get(ApiTagToken)).toEqual({ name: 'Users' })
    })
  })

  it('ApiOperation stores operation metadata on a method', async () => {
    @Controller()
    class TestController {
      @ApiOperation({
        summary: 'Get user',
        description: 'Retrieves a user by ID',
        operationId: 'getUser',
        deprecated: true,
      })
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const route = await routeOf(TestController, 'getUser')
    expect(route.attributes.handler.get(ApiOperationToken)).toEqual({
      summary: 'Get user',
      description: 'Retrieves a user by ID',
      operationId: 'getUser',
      deprecated: true,
    })
  })

  it('ApiSummary stores the summary on a method', async () => {
    @Controller()
    class TestController {
      @ApiSummary('Get user by ID')
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const route = await routeOf(TestController, 'getUser')
    expect(route.attributes.handler.get(ApiSummaryToken)).toBe('Get user by ID')
  })

  describe('ApiDeprecated', () => {
    it('stores the message', async () => {
      @Controller()
      class TestController {
        @ApiDeprecated('Use v2 instead')
        @Endpoint(getUser)
        async getUser() {
          return { id: '1' }
        }
      }

      const route = await routeOf(TestController, 'getUser')
      expect(route.attributes.handler.get(ApiDeprecatedToken)).toEqual({
        message: 'Use v2 instead',
      })
    })

    it('works without a message', async () => {
      @Controller()
      class TestController {
        @ApiDeprecated()
        @Endpoint(getUser)
        async getUser() {
          return { id: '1' }
        }
      }

      const route = await routeOf(TestController, 'getUser')
      expect(route.attributes.handler.get(ApiDeprecatedToken)).toEqual({})
    })
  })

  it('ApiSecurity stores the requirement', async () => {
    @Controller()
    class TestController {
      @ApiSecurity({ bearerAuth: [] })
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const route = await routeOf(TestController, 'getUser')
    expect(route.attributes.handler.get(ApiSecurityToken)).toEqual({ bearerAuth: [] })
  })

  it('ApiExclude stores a flag', async () => {
    @Controller()
    class TestController {
      @ApiExclude()
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const route = await routeOf(TestController, 'getUser')
    expect(route.attributes.handler.get(ApiExcludeToken)).toBe(true)
  })

  it('ApiStream stores the content type and description', async () => {
    @Controller()
    class TestController {
      @ApiStream({ contentType: 'text/event-stream', description: 'Event stream' })
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const route = await routeOf(TestController, 'getUser')
    expect(route.attributes.handler.get(ApiStreamToken)).toEqual({
      contentType: 'text/event-stream',
      description: 'Event stream',
    })
  })

  it('rejects an invalid value when the attribute is applied', () => {
    expect(() => ApiSummary(1 as unknown as string)).toThrow(/expected a string/)
    expect(() => ApiSecurity({ bearerAuth: 'x' } as never)).toThrow(/array of strings/)
    expect(() => ApiStream({} as never)).toThrow(/contentType/)
    expect(() => ApiOperation({ summary: 1 } as never)).toThrow(/summary/)
  })

  it('works as a decorator on a handler() field', async () => {
    @Controller()
    class TestController {
      @ApiSummary('From a field decorator')
      @ApiTag('Fields')
      getUser = handler(getUser, () => ({ id: '1' }))
    }

    const metadata = extractOpenApiMetadata(await routeOf(TestController, 'getUser'))
    expect(metadata.summary).toBe('From a field decorator')
    expect(metadata.tags).toEqual(['Fields'])
  })

  it('works in handler() options', async () => {
    @Controller()
    class TestController {
      getUser = handler(
        getUser,
        {
          attributes: [
            ApiSummary('From options'),
            ApiTag('Options'),
            ApiSecurity({ apiKey: [] }),
            ApiDeprecated('old'),
            ApiOperation({ operationId: 'getUserById' }),
          ],
        },
        () => ({ id: '1' }),
      )
    }

    const metadata = extractOpenApiMetadata(await routeOf(TestController, 'getUser'))
    expect(metadata).toMatchObject({
      summary: 'From options',
      tags: ['Options'],
      security: [{ apiKey: [] }],
      deprecated: true,
      deprecationMessage: 'old',
      operationId: 'getUserById',
    })
  })
})

describe('extractOpenApiMetadata', () => {
  it('extracts tags from the controller', async () => {
    @ApiTag('Users', 'User operations')
    @Controller()
    class TestController {
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const metadata = extractOpenApiMetadata(await routeOf(TestController, 'getUser'))
    expect(metadata.tags).toEqual(['Users'])
    expect(metadata.tagDefinitions).toEqual([{ name: 'Users', description: 'User operations' }])
  })

  it('combines controller and handler tags, outermost first', async () => {
    @ApiTag('Users')
    @Controller()
    class TestController {
      @ApiTag('Admin')
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const metadata = extractOpenApiMetadata(await routeOf(TestController, 'getUser'))
    expect(metadata.tags).toEqual(['Users', 'Admin'])
  })

  it('reads tags, security, deprecation and exclusion from the module', async () => {
    @Controller()
    class TestController {
      @ApiTag('Users')
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    @ApiTag('Internal')
    @ApiSecurity({ bearerAuth: [] })
    @ApiDeprecated('whole module')
    @ApiExclude()
    @Module({ controllers: [TestController] })
    class AppModule {}

    const app = await createAppFromModule(AppModule)
    const metadata = extractOpenApiMetadata(app.routes()[0])
    expect(metadata.tags).toEqual(['Internal', 'Users'])
    expect(metadata.security).toEqual([{ bearerAuth: [] }])
    expect(metadata.deprecated).toBe(true)
    expect(metadata.excluded).toBe(true)
  })

  it('lets the handler override the security of its controller', async () => {
    @ApiSecurity({ bearerAuth: [] })
    @Controller()
    class TestController {
      @ApiSecurity({ apiKey: [] })
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }

      @Endpoint(listUsers)
      async listUsers() {
        return []
      }
    }

    expect(extractOpenApiMetadata(await routeOf(TestController, 'getUser')).security).toEqual([
      { apiKey: [] },
    ])
    expect(extractOpenApiMetadata(await routeOf(TestController, 'listUsers')).security).toEqual([
      { bearerAuth: [] },
    ])
  })

  it('extracts the summary from ApiSummary', async () => {
    @Controller()
    class TestController {
      @ApiSummary('Get user by ID')
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    expect(extractOpenApiMetadata(await routeOf(TestController, 'getUser')).summary).toBe(
      'Get user by ID',
    )
  })

  it('extracts operation metadata from ApiOperation, which wins over ApiSummary', async () => {
    @Controller()
    class TestController {
      @ApiSummary('ignored')
      @ApiOperation({
        summary: 'Get user',
        description: 'Retrieves a user',
        operationId: 'getUserById',
        externalDocs: { url: 'https://docs.example.com' },
      })
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const metadata = extractOpenApiMetadata(await routeOf(TestController, 'getUser'))
    expect(metadata.summary).toBe('Get user')
    expect(metadata.description).toBe('Retrieves a user')
    expect(metadata.operationId).toBe('getUserById')
    expect(metadata.externalDocs).toEqual({ url: 'https://docs.example.com' })
  })

  it('marks an endpoint as deprecated', async () => {
    @Controller()
    class TestController {
      @ApiDeprecated('Use v2')
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }

      @ApiOperation({ deprecated: true })
      @Endpoint(listUsers)
      async listUsers() {
        return []
      }
    }

    const first = extractOpenApiMetadata(await routeOf(TestController, 'getUser'))
    expect(first.deprecated).toBe(true)
    expect(first.deprecationMessage).toBe('Use v2')
    expect(extractOpenApiMetadata(await routeOf(TestController, 'listUsers')).deprecated).toBe(true)
  })

  it('extracts security requirements', async () => {
    @Controller()
    class TestController {
      @ApiSecurity({ bearerAuth: [], apiKey: [] })
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    expect(extractOpenApiMetadata(await routeOf(TestController, 'getUser')).security).toEqual([
      { bearerAuth: [], apiKey: [] },
    ])
  })

  it('marks an endpoint as excluded', async () => {
    @Controller()
    class TestController {
      @ApiExclude()
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    expect(extractOpenApiMetadata(await routeOf(TestController, 'getUser')).excluded).toBe(true)
  })

  it('extracts stream metadata', async () => {
    @Controller()
    class TestController {
      @ApiStream({ contentType: 'text/event-stream', description: 'Real-time events' })
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    expect(extractOpenApiMetadata(await routeOf(TestController, 'getUser')).stream).toEqual({
      contentType: 'text/event-stream',
      description: 'Real-time events',
    })
  })

  it('combines several attributes', async () => {
    @ApiTag('Users')
    @Controller()
    class TestController {
      @ApiOperation({ summary: 'Get user', operationId: 'getUser' })
      @ApiSecurity({ bearerAuth: [] })
      @ApiDeprecated()
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    const metadata = extractOpenApiMetadata(await routeOf(TestController, 'getUser'))
    expect(metadata.tags).toEqual(['Users'])
    expect(metadata.summary).toBe('Get user')
    expect(metadata.operationId).toBe('getUser')
    expect(metadata.security).toEqual([{ bearerAuth: [] }])
    expect(metadata.deprecated).toBe(true)
  })

  it('gives defaults for an endpoint without attributes', async () => {
    @Controller()
    class TestController {
      @Endpoint(getUser)
      async getUser() {
        return { id: '1' }
      }
    }

    expect(extractOpenApiMetadata(await routeOf(TestController, 'getUser'))).toEqual({
      tags: [],
      tagDefinitions: [],
      summary: undefined,
      description: undefined,
      operationId: undefined,
      deprecated: false,
      deprecationMessage: undefined,
      externalDocs: undefined,
      security: undefined,
      stream: undefined,
      excluded: false,
    })
  })
})
