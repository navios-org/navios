import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  extractControllerMetadata,
  HttpCode,
  Multipart,
  reply,
} from '@navios/core'
import { TestContainer } from '@navios/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { ClassType, HandlerMetadata, ModuleMetadata } from '@navios/core'

import { MetadataExtractorService } from '../services/metadata-extractor.service.mjs'
import { PathBuilderService } from '../services/path-builder.service.mjs'

import type { DiscoveredEndpoint } from '../services/endpoint-scanner.service.mjs'

describe('PathBuilderService.build', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  afterEach(async () => {
    await container.dispose()
  })

  /** Discovers the endpoints of a decorated controller the way the scanner does. */
  const discover = async (controllerClass: ClassType): Promise<DiscoveredEndpoint[]> => {
    const extractor = await container.get(MetadataExtractorService)
    const controller = extractControllerMetadata(controllerClass)
    // The scanner reads each handler's config loosely, like `DiscoveredEndpoint.handler`
    const handlers: HandlerMetadata<any>[] = [...controller.endpoints]
    return handlers.map((handler) => ({
      module: {} as ModuleMetadata,
      controllerClass,
      controller,
      handler,
      config: handler.config,
      openApiMetadata: extractor.extract(controller, handler),
    }))
  }

  const api = builder()

  describe('response: void endpoints', () => {
    const deleteItem = api.declareEndpoint({
      method: 'DELETE',
      url: '/items/$id',
      response: 'void',
      errorSchema: { 404: z.object({ message: z.string() }) },
    })
    const archiveItem = api.declareEndpoint({
      method: 'POST',
      url: '/items/$id/archive',
      response: 'void',
      requestSchema: z.object({ reason: z.string() }),
    })

    @Controller()
    class ItemsController {
      @Endpoint(deleteItem)
      async remove() {}

      @Endpoint(archiveItem)
      @HttpCode(202)
      async archive() {}
    }

    it('should describe the endpoint with a 204 response and no content', async () => {
      const service = await container.get(PathBuilderService)
      const [endpoint] = await discover(ItemsController)

      const { path, pathItem } = service.build(endpoint)

      expect(path).toBe('/items/{id}')
      expect(pathItem.delete?.responses).toEqual({
        204: { description: 'No content' },
        404: {
          description: 'Error response (404)',
          content: { 'application/json': { schema: expect.any(Object) } },
        },
      })
      expect(pathItem.delete?.responses?.[204]).not.toHaveProperty('content')
      expect(pathItem.delete?.responses).not.toHaveProperty('200')
      expect(pathItem.delete?.requestBody).toBeUndefined()
      expect(pathItem.delete?.parameters).toEqual([
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ])
    })

    it('should use the status set with @HttpCode and keep the request body', async () => {
      const service = await container.get(PathBuilderService)
      const [, endpoint] = await discover(ItemsController)

      const { pathItem } = service.build(endpoint)

      expect(pathItem.post?.responses).toEqual({ 202: { description: 'No content' } })
      expect(pathItem.post?.requestBody).toEqual({
        required: true,
        content: { 'application/json': { schema: expect.any(Object) } },
      })
    })
  })

  describe('JSON endpoints', () => {
    it('should describe a 200 response with the response schema', async () => {
      const getItem = api.declareEndpoint({
        method: 'GET',
        url: '/items/$id',
        responseSchema: z.object({ id: z.string() }),
      })

      @Controller()
      class ItemsController {
        @Endpoint(getItem)
        async get() {
          return { id: '1' }
        }
      }

      const service = await container.get(PathBuilderService)
      const [endpoint] = await discover(ItemsController)

      const { pathItem } = service.build(endpoint)

      expect(pathItem.get?.responses).toEqual({
        200: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
              },
            },
          },
        },
      })
    })
  })

  describe('responses endpoints', () => {
    const putItem = api.declareEndpoint({
      method: 'PUT',
      url: '/items/$id',
      requestSchema: z.object({ name: z.string() }),
      responses: {
        200: z.object({ id: z.string(), name: z.string() }),
        201: z.object({ id: z.string() }),
        204: null,
      },
      errorSchema: { 404: z.object({ message: z.string() }) },
    })

    @Controller()
    class ItemsController {
      @Endpoint(putItem)
      async put() {
        return reply(204)
      }
    }

    it('should describe one response per declared status', async () => {
      const service = await container.get(PathBuilderService)
      const [endpoint] = await discover(ItemsController)

      const { path, pathItem } = service.build(endpoint)

      expect(path).toBe('/items/{id}')
      expect(pathItem.put?.responses).toEqual({
        200: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'string' }, name: { type: 'string' } },
                required: ['id', 'name'],
                additionalProperties: false,
              },
            },
          },
        },
        201: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
              },
            },
          },
        },
        204: { description: 'No content' },
        404: {
          description: 'Error response (404)',
          content: { 'application/json': { schema: expect.any(Object) } },
        },
      })
      expect(pathItem.put?.responses?.[204]).not.toHaveProperty('content')
      expect(pathItem.put?.requestBody).toEqual({
        required: true,
        content: { 'application/json': { schema: expect.any(Object) } },
      })
    })

    it('should describe a map of bodiless statuses without content', async () => {
      const ping = api.declareEndpoint({
        method: 'POST',
        url: '/ping',
        responses: { 202: null, 204: null },
      })

      @Controller()
      class PingController {
        @Endpoint(ping)
        async ping() {
          return reply(202)
        }
      }

      const service = await container.get(PathBuilderService)
      const [endpoint] = await discover(PingController)

      expect(service.build(endpoint).pathItem.post?.responses).toEqual({
        202: { description: 'No content' },
        204: { description: 'No content' },
      })
    })
  })

  describe('multipart endpoints', () => {
    const fileSchema = z.object({ file: z.file() })
    const multipartBody = {
      required: true,
      content: { 'multipart/form-data': { schema: expect.any(Object) } },
    }

    it('should describe a JSON response like a plain endpoint', async () => {
      const upload = api.declareEndpoint({
        method: 'POST',
        url: '/files',
        body: 'multipart',
        requestSchema: fileSchema,
        responseSchema: z.object({ id: z.string() }),
      })

      @Controller()
      class FilesController {
        @Multipart(upload)
        async upload() {
          return { id: '1' }
        }
      }

      const service = await container.get(PathBuilderService)
      const [endpoint] = await discover(FilesController)
      const { pathItem } = service.build(endpoint)

      expect(pathItem.post?.requestBody).toEqual(multipartBody)
      expect(pathItem.post?.responses).toEqual({
        200: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
              },
            },
          },
        },
      })
    })

    it('should describe a response: void upload with a 204 response and no content', async () => {
      const uploadAvatar = api.declareEndpoint({
        method: 'PUT',
        url: '/users/$id/avatar',
        body: 'multipart',
        response: 'void',
        requestSchema: fileSchema,
        errorSchema: { 413: z.object({ message: z.string() }) },
      })
      const queueUpload = api.declareEndpoint({
        method: 'POST',
        url: '/uploads/queue',
        body: 'multipart',
        response: 'void',
        requestSchema: fileSchema,
      })

      @Controller()
      class UploadController {
        @Multipart(uploadAvatar)
        async uploadAvatar() {}

        @Multipart(queueUpload)
        @HttpCode(202)
        async queueUpload() {}
      }

      const service = await container.get(PathBuilderService)
      const [avatar, queued] = await discover(UploadController)
      const { path, pathItem } = service.build(avatar)

      expect(path).toBe('/users/{id}/avatar')
      expect(pathItem.put?.requestBody).toEqual(multipartBody)
      expect(pathItem.put?.responses).toEqual({
        204: { description: 'No content' },
        413: {
          description: 'Error response (413)',
          content: { 'application/json': { schema: expect.any(Object) } },
        },
      })
      expect(pathItem.put?.responses?.[204]).not.toHaveProperty('content')

      // The status set with @HttpCode
      expect(service.build(queued).pathItem.post?.responses).toEqual({
        202: { description: 'No content' },
      })
    })

    it('should describe one response per status of a responses map', async () => {
      const importItems = api.declareEndpoint({
        method: 'POST',
        url: '/items/import',
        body: 'multipart',
        requestSchema: fileSchema,
        responses: {
          200: z.object({ imported: z.number() }),
          201: z.object({ id: z.string() }),
          204: null,
        },
        errorSchema: { 413: z.object({ message: z.string() }) },
      })

      @Controller()
      class ImportController {
        @Multipart(importItems)
        async importItems() {
          return reply(204)
        }
      }

      const service = await container.get(PathBuilderService)
      const [endpoint] = await discover(ImportController)
      const { pathItem } = service.build(endpoint)

      expect(pathItem.post?.requestBody).toEqual(multipartBody)
      expect(pathItem.post?.responses).toEqual({
        200: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { imported: { type: 'number' } },
                required: ['imported'],
                additionalProperties: false,
              },
            },
          },
        },
        201: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
              },
            },
          },
        },
        204: { description: 'No content' },
        413: {
          description: 'Error response (413)',
          content: { 'application/json': { schema: expect.any(Object) } },
        },
      })
      expect(pathItem.post?.responses?.[204]).not.toHaveProperty('content')
    })
  })
})
