import { Controller, extractControllerMetadata } from '@navios/core'
import { TestContainer } from '@navios/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { HandlerMetadata } from '@navios/core'

import {
  ApiDeprecated,
  ApiExclude,
  ApiOperation,
  ApiSecurity,
  ApiStream,
  ApiSummary,
  ApiTag,
} from '../decorators/index.mjs'
import { MetadataExtractorService } from '../services/metadata-extractor.service.mjs'

describe('Metadata Extraction', () => {
  let container: TestContainer
  let metadataExtractor: MetadataExtractorService

  beforeEach(async () => {
    container = new TestContainer()
    metadataExtractor = await container.get(MetadataExtractorService)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('MetadataExtractorService', () => {
    it('should extract tags from controller', () => {
      @ApiTag('Users', 'User management')
      @Controller()
      class UserController {
        @ApiSummary('Get user')
        getUser() {}
      }

      const controllerMeta = extractControllerMetadata(UserController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.tags).toEqual(['Users'])
    })

    it('should extract tags from method (both controller and method tags)', () => {
      @ApiTag('Users')
      @Controller()
      class MixedController {
        @ApiTag('Orders')
        getOrder() {}
      }

      const controllerMeta = extractControllerMetadata(MixedController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      // Both tags should be included
      expect(metadata.tags).toContain('Users')
      expect(metadata.tags).toContain('Orders')
    })

    it('should extract summary from @ApiSummary', () => {
      @Controller()
      class TestController {
        @ApiSummary('Get a user by ID')
        getUser() {}
      }

      const controllerMeta = extractControllerMetadata(TestController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.summary).toBe('Get a user by ID')
    })

    it('should extract operation metadata from @ApiOperation', () => {
      @Controller()
      class TestController {
        @ApiOperation({
          summary: 'Create user',
          description: 'Creates a new user in the system',
          operationId: 'createUser',
          deprecated: false,
        })
        createUser() {}
      }

      const controllerMeta = extractControllerMetadata(TestController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.summary).toBe('Create user')
      expect(metadata.description).toBe('Creates a new user in the system')
      expect(metadata.operationId).toBe('createUser')
      expect(metadata.deprecated).toBe(false)
    })

    it('should mark endpoint as deprecated', () => {
      @Controller()
      class TestController {
        @ApiDeprecated('Use v2 API instead')
        legacyEndpoint() {}
      }

      const controllerMeta = extractControllerMetadata(TestController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.deprecated).toBe(true)
    })

    it('should extract security requirements', () => {
      @Controller()
      class TestController {
        @ApiSecurity({ bearerAuth: [] })
        securedEndpoint() {}
      }

      const controllerMeta = extractControllerMetadata(TestController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.security).toEqual([{ bearerAuth: [] }])
    })

    it('should mark endpoint as excluded', () => {
      @Controller()
      class TestController {
        @ApiExclude()
        hiddenEndpoint() {}
      }

      const controllerMeta = extractControllerMetadata(TestController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.excluded).toBe(true)
    })

    it('should extract stream metadata', () => {
      @Controller()
      class TestController {
        @ApiStream({
          contentType: 'text/event-stream',
          description: 'Real-time notifications',
        })
        streamEvents() {}
      }

      const controllerMeta = extractControllerMetadata(TestController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.stream).toEqual({
        contentType: 'text/event-stream',
        description: 'Real-time notifications',
      })
    })

    it('should combine multiple decorators', () => {
      @ApiTag('Files')
      @Controller()
      class FileController {
        @ApiOperation({
          summary: 'Upload file',
          description: 'Uploads a file to storage',
        })
        @ApiSecurity({ bearerAuth: [] })
        uploadFile() {}
      }

      const controllerMeta = extractControllerMetadata(FileController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.tags).toEqual(['Files'])
      expect(metadata.summary).toBe('Upload file')
      expect(metadata.description).toBe('Uploads a file to storage')
      expect(metadata.security).toEqual([{ bearerAuth: [] }])
    })

    it('should handle endpoint with no OpenAPI decorators', () => {
      @Controller()
      class PlainController {
        @ApiSummary('Plain endpoint')
        plainEndpoint() {}
      }

      const controllerMeta = extractControllerMetadata(PlainController)
      const handler = [...controllerMeta.endpoints][0] as HandlerMetadata<any>
      // Manually remove the summary to test no decorators scenario
      handler.customAttributes.clear()
      const metadata = metadataExtractor.extract(controllerMeta, handler)

      expect(metadata.tags).toEqual([])
      expect(metadata.summary).toBeUndefined()
      expect(metadata.description).toBeUndefined()
      expect(metadata.deprecated).toBe(false)
      expect(metadata.excluded).toBe(false)
    })
  })
})
