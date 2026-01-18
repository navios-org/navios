import { Controller, extractControllerMetadata } from '@navios/core'
import { describe, expect, it } from 'vitest'

import {
  ApiDeprecated,
  ApiExclude,
  ApiOperation,
  ApiSecurity,
  ApiStream,
  ApiSummary,
  ApiTag,
} from '../decorators/index.mjs'
import {
  ApiDeprecatedToken,
  ApiExcludeToken,
  ApiOperationToken,
  ApiSecurityToken,
  ApiStreamToken,
  ApiSummaryToken,
  ApiTagToken,
} from '../tokens/index.mjs'

describe('OpenAPI Decorators', () => {
  describe('@ApiTag', () => {
    it('should store tag metadata on class', () => {
      // @ApiTag must come before @Controller (decorators execute bottom-up)
      @ApiTag('Users', 'User management operations')
      @Controller()
      class UserController {}

      const meta = extractControllerMetadata(UserController)
      const tagMeta = meta.customAttributes.get(ApiTagToken)

      expect(tagMeta).toEqual({
        name: 'Users',
        description: 'User management operations',
      })
    })

    it('should work with just name', () => {
      @ApiTag('Products')
      @Controller()
      class ProductController {}

      const meta = extractControllerMetadata(ProductController)
      const tagMeta = meta.customAttributes.get(ApiTagToken)

      expect(tagMeta).toEqual({
        name: 'Products',
        description: undefined,
      })
    })
  })

  describe('@ApiOperation', () => {
    it('should store operation metadata on method', () => {
      @Controller()
      class TestController {
        @ApiOperation({
          summary: 'Get user by ID',
          description: 'Retrieves a user by their unique identifier',
          operationId: 'getUserById',
          deprecated: false,
        })
        getUser() {}
      }

      const meta = extractControllerMetadata(TestController)
      const handler = [...meta.endpoints][0]
      const opMeta = handler.customAttributes.get(ApiOperationToken)

      expect(opMeta).toEqual({
        summary: 'Get user by ID',
        description: 'Retrieves a user by their unique identifier',
        operationId: 'getUserById',
        deprecated: false,
        externalDocs: undefined,
      })
    })
  })

  describe('@ApiSummary', () => {
    it('should store summary metadata on method', () => {
      @Controller()
      class TestController {
        @ApiSummary('Create a new user')
        createUser() {}
      }

      const meta = extractControllerMetadata(TestController)
      const handler = [...meta.endpoints][0]
      const summaryMeta = handler.customAttributes.get(ApiSummaryToken)

      expect(summaryMeta).toBe('Create a new user')
    })
  })

  describe('@ApiDeprecated', () => {
    it('should store deprecated metadata on method', () => {
      @Controller()
      class TestController {
        @ApiDeprecated('Use v2 instead')
        legacyEndpoint() {}
      }

      const meta = extractControllerMetadata(TestController)
      const handler = [...meta.endpoints][0]
      const deprecatedMeta = handler.customAttributes.get(ApiDeprecatedToken)

      expect(deprecatedMeta).toEqual({
        message: 'Use v2 instead',
      })
    })

    it('should work without message', () => {
      @Controller()
      class TestController {
        @ApiDeprecated()
        oldEndpoint() {}
      }

      const meta = extractControllerMetadata(TestController)
      const handler = [...meta.endpoints][0]
      const deprecatedMeta = handler.customAttributes.get(ApiDeprecatedToken)

      // When called without message, stores { message: undefined }
      expect(deprecatedMeta).toMatchObject({})
    })
  })

  describe('@ApiSecurity', () => {
    it('should store security metadata on method', () => {
      @Controller()
      class TestController {
        @ApiSecurity({ bearerAuth: [] })
        securedEndpoint() {}
      }

      const meta = extractControllerMetadata(TestController)
      const handler = [...meta.endpoints][0]
      const securityMeta = handler.customAttributes.get(ApiSecurityToken)

      expect(securityMeta).toEqual({ bearerAuth: [] })
    })
  })

  describe('@ApiExclude', () => {
    it('should store exclude metadata on method', () => {
      @Controller()
      class TestController {
        @ApiExclude()
        hiddenEndpoint() {}
      }

      const meta = extractControllerMetadata(TestController)
      const handler = [...meta.endpoints][0]
      const excludeMeta = handler.customAttributes.get(ApiExcludeToken)

      expect(excludeMeta).toBe(true)
    })
  })

  describe('@ApiStream', () => {
    it('should store stream metadata on method', () => {
      @Controller()
      class TestController {
        @ApiStream({
          contentType: 'text/event-stream',
          description: 'Real-time events',
        })
        eventStream() {}
      }

      const meta = extractControllerMetadata(TestController)
      const handler = [...meta.endpoints][0]
      const streamMeta = handler.customAttributes.get(ApiStreamToken)

      expect(streamMeta).toEqual({
        contentType: 'text/event-stream',
        description: 'Real-time events',
      })
    })
  })
})
