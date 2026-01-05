// oxlint-disable no-unused-vars
import type { EndpointParams, EndpointResult } from '@navios/core/legacy-compat'

import { builder } from '@navios/builder'
import { Controller, Endpoint } from '@navios/core/legacy-compat'

import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import {
  ApiDeprecated,
  ApiExclude,
  ApiOperation,
  ApiSecurity,
  ApiStream,
  ApiSummary,
  ApiTag,
} from '../index.mjs'

// Create a test API builder
const api = builder()

// Test schemas
const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const querySchema = z.object({
  page: z.number(),
  limit: z.number(),
})

// Test endpoint declarations
const getUserEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  querySchema,
  responseSchema,
})

const createUserEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string(),
  }),
  responseSchema,
})

const downloadFileEndpoint = api.declareStream({
  method: 'GET',
  url: '/files/$fileId',
  querySchema,
})

describe('Legacy OpenAPI Decorators Type Safety', () => {
  describe('ApiTag decorator', () => {
    test('should work on controller level', () => {
      @ApiTag('Users', 'User management operations')
      @Controller()
      class UserController {
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should work on method level', () => {
      @Controller()
      class UserController {
        @ApiTag('Users')
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should accept optional description', () => {
      @ApiTag('Users')
      @Controller()
      class UserController {}

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('ApiOperation decorator', () => {
    test('should work with full options', () => {
      @Controller()
      class UserController {
        @ApiOperation({
          summary: 'Get user by ID',
          description: 'Retrieves a user by their unique identifier',
          operationId: 'getUserById',
          deprecated: false,
          externalDocs: {
            url: 'https://docs.example.com',
            description: 'API docs',
          },
        })
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should work with partial options', () => {
      @Controller()
      class UserController {
        @ApiOperation({
          summary: 'Get user',
        })
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('ApiSummary decorator', () => {
    test('should work with string summary', () => {
      @Controller()
      class UserController {
        @ApiSummary('Get user by ID')
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('ApiDeprecated decorator', () => {
    test('should work without message', () => {
      @Controller()
      class UserController {
        @ApiDeprecated()
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should work with deprecation message', () => {
      @Controller()
      class UserController {
        @ApiDeprecated('Use GET /v2/users/:id instead')
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('ApiSecurity decorator', () => {
    test('should work with bearer auth', () => {
      @Controller()
      class UserController {
        @ApiSecurity({ bearerAuth: [] })
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should work with OAuth2 scopes', () => {
      @Controller()
      class UserController {
        @ApiSecurity({ oauth2: ['users:read', 'users:write'] })
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should work with multiple auth methods', () => {
      @Controller()
      class UserController {
        @ApiSecurity({ bearerAuth: [], apiKey: [] })
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('ApiExclude decorator', () => {
    test('should work on endpoint', () => {
      @Controller()
      class HealthController {
        @ApiExclude()
        @Endpoint(getUserEndpoint)
        async healthCheck(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: 'health', name: 'ok' }
        }
      }

      expectTypeOf(HealthController).toBeConstructibleWith()
    })
  })

  describe('ApiStream decorator', () => {
    test('should work with content type and description', () => {
      @Controller()
      class FileController {
        @ApiStream({
          contentType: 'application/octet-stream',
          description: 'Download file as binary stream',
        })
        @Endpoint(getUserEndpoint)
        async downloadFile(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'file.bin' }
        }
      }

      expectTypeOf(FileController).toBeConstructibleWith()
    })

    test('should work for SSE endpoints', () => {
      @Controller()
      class EventController {
        @ApiStream({
          contentType: 'text/event-stream',
          description: 'Real-time event stream',
        })
        @Endpoint(getUserEndpoint)
        async streamEvents(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: 'stream', name: 'events' }
        }
      }

      expectTypeOf(EventController).toBeConstructibleWith()
    })
  })

  describe('Integration - multiple decorators together', () => {
    test('should work with all OpenAPI decorators on controller and methods', () => {
      @ApiTag('Users', 'User management API')
      @Controller()
      class UserController {
        @ApiOperation({
          summary: 'Get user by ID',
          description: 'Retrieves a user by their unique identifier',
          operationId: 'getUserById',
        })
        @ApiSecurity({ bearerAuth: [] })
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return {
            id: request.urlParams.userId.toString(),
            name: 'John',
          }
        }

        @ApiSummary('Create a new user')
        @ApiSecurity({ bearerAuth: [] })
        @Endpoint(createUserEndpoint)
        async createUser(
          request: EndpointParams<typeof createUserEndpoint>,
        ): EndpointResult<typeof createUserEndpoint> {
          return {
            id: '1',
            name: request.data.name,
          }
        }

        @ApiDeprecated('Use GET /v2/users/:id instead')
        @ApiTag('Legacy')
        @Endpoint(getUserEndpoint)
        async getLegacyUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }

        @ApiExclude()
        @Endpoint(getUserEndpoint)
        async internalEndpoint(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: 'internal', name: 'hidden' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })
})
