import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  extractControllerMetadata,
  HttpCode,
  NaviosOptionsToken,
  reply as coreReply,
} from '@navios/core'
import { Injectable } from '@navios/di'
import { TestContainer } from '@navios/di/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type {
  ClassType,
  HandlerContext,
  HandlerMetadata,
  InstanceResolution,
  NaviosApplicationOptions,
  ZodBaseEndpointOptions,
} from '@navios/core'

import { FastifyEndpointAdapterService } from '../adapters/endpoint-adapter.service.mjs'

/**
 * Binds NaviosOptionsToken with partial options for testing.
 * Only validateResponses is needed for adapter tests.
 */
const bindNaviosOptions = (
  container: TestContainer,
  options: Partial<NaviosApplicationOptions>,
) => {
  container.bind(NaviosOptionsToken).toValue(options as NaviosApplicationOptions)
}

// Mock types for Fastify
interface MockFastifyRequest {
  query: Record<string, any>
  params: Record<string, any>
  body: any
}

interface MockFastifyReply {
  status: ReturnType<typeof vi.fn>
  headers: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

const createMockRequest = (overrides: Partial<MockFastifyRequest> = {}): MockFastifyRequest => ({
  query: {},
  params: {},
  body: {},
  ...overrides,
})

const createMockReply = (): MockFastifyReply => ({
  status: vi.fn().mockReturnThis(),
  headers: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
})

const createHandlerMetadata = (
  config: Partial<ZodBaseEndpointOptions>,
  classMethod = 'test',
): HandlerMetadata<ZodBaseEndpointOptions> => ({
  classMethod,
  url: config.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config.method ?? 'GET',
  config: config as ZodBaseEndpointOptions,
  guards: new Set(),
  customAttributes: new Map(),
})

const createHandlerContext = (
  handlerMetadata: HandlerMetadata<ZodBaseEndpointOptions>,
  overrides: Partial<HandlerContext<ZodBaseEndpointOptions>> = {},
): HandlerContext<ZodBaseEndpointOptions> => ({
  methodName: handlerMetadata.classMethod,
  statusCode: handlerMetadata.successStatusCode,
  headers: handlerMetadata.headers,
  handlerMetadata,
  hasArguments: true,
  ...overrides,
})

/**
 * Test adapter that exposes protected methods for testing
 */
@Injectable()
class TestFastifyEndpointAdapter extends FastifyEndpointAdapterService {
  testCreateStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: (request: any) => any,
    context: HandlerContext<ZodBaseEndpointOptions>,
  ) {
    return this.createStaticHandler(boundMethod, formatArguments, context)
  }

  testCreateDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: (request: any) => any,
    context: HandlerContext<ZodBaseEndpointOptions>,
  ) {
    return this.createDynamicHandler(resolution, formatArguments, context)
  }
}

describe('FastifyEndpointAdapterService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('hasSchema', () => {
    it('should return true when responseSchema exists and validateResponses is true', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })

    it('should return true when requestSchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
        requestSchema: z.object({ name: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return true when querySchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        querySchema: z.object({ page: z.number() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when no schemas exist', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })
  })

  describe('provideSchema', () => {
    it('should include response schema when validateResponses is true', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const responseSchema = z.object({ id: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.response).toBeDefined()
      expect(schema.response[200]).toBe(responseSchema)
    })

    it('should include error schema in response when provided', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const responseSchema = z.object({ id: z.string() })
      const errorSchema = { 400: z.object({ error: z.string() }) }
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
        errorSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.response[400]).toBe(errorSchema[400])
      expect(schema.response[200]).toBe(responseSchema)
    })

    it('should include body schema when requestSchema is provided', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const requestSchema = z.object({ name: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
        requestSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.body).toBe(requestSchema)
    })

    it('should include querystring schema when querySchema is provided', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const querySchema = z.object({ page: z.number() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        querySchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.querystring).toBe(querySchema)
    })
  })

  describe('createStaticHandler', () => {
    it('should create static handler with arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ id: '123' })
      const formatArguments = vi.fn().mockResolvedValue({ data: { name: 'test' } })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })
      const context = createHandlerContext(handlerMetadata, {
        headers: { 'x-custom': 'value' },
        hasArguments: true,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)

      expect(result.isStatic).toBe(true)
      expect(typeof result.handler).toBe('function')

      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(request as any, reply as any)

      expect(formatArguments).toHaveBeenCalledWith(request)
      expect(boundMethod).toHaveBeenCalledWith({ data: { name: 'test' } })
      expect(reply.status).toHaveBeenCalledWith(200)
      expect(reply.headers).toHaveBeenCalledWith({ 'x-custom': 'value' })
      expect(reply.send).toHaveBeenCalledWith({ id: '123' })
    })

    it('should create static handler without arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ message: 'hello' })
      const formatArguments = vi.fn()
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
      })
      handlerMetadata.successStatusCode = 201
      const context = createHandlerContext(handlerMetadata, {
        statusCode: 201,
        hasArguments: false,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)

      expect(result.isStatic).toBe(true)

      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(request as any, reply as any)

      expect(formatArguments).not.toHaveBeenCalled()
      expect(boundMethod).toHaveBeenCalledWith(expect.any(Object))
      expect(reply.status).toHaveBeenCalledWith(201)
      expect(reply.send).toHaveBeenCalledWith({ message: 'hello' })
    })
  })

  describe('createDynamicHandler', () => {
    it('should create dynamic handler with arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const mockController = {
        testMethod: vi.fn().mockResolvedValue({ id: '123' }),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn().mockResolvedValue({ data: { name: 'test' } })
      const handlerMetadata = createHandlerMetadata(
        {
          method: 'GET',
          url: '/test',
        },
        'testMethod',
      )
      const context = createHandlerContext(handlerMetadata, {
        headers: { 'x-custom': 'value' },
        hasArguments: true,
      })

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)

      expect(result.isStatic).toBe(false)
      expect(typeof result.handler).toBe('function')

      const scopedContainer = {}
      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(scopedContainer as any, request as any, reply as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(formatArguments).toHaveBeenCalledWith(request)
      expect(mockController.testMethod).toHaveBeenCalledWith({
        data: { name: 'test' },
      })
      expect(reply.status).toHaveBeenCalledWith(200)
      expect(reply.headers).toHaveBeenCalledWith({ 'x-custom': 'value' })
      expect(reply.send).toHaveBeenCalledWith({ id: '123' })
    })

    it('should create dynamic handler without arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const mockController = {
        noArgsMethod: vi.fn().mockResolvedValue({ status: 'ok' }),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn()
      const handlerMetadata = createHandlerMetadata(
        {
          method: 'DELETE',
          url: '/test',
        },
        'noArgsMethod',
      )
      handlerMetadata.successStatusCode = 204
      const context = createHandlerContext(handlerMetadata, {
        statusCode: 204,
        hasArguments: false,
      })

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)

      expect(result.isStatic).toBe(false)

      const scopedContainer = {}
      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(scopedContainer as any, request as any, reply as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(formatArguments).not.toHaveBeenCalled()
      expect(mockController.noArgsMethod).toHaveBeenCalledWith(expect.any(Object))
      expect(reply.status).toHaveBeenCalledWith(204)
      expect(reply.send).toHaveBeenCalledWith({ status: 'ok' })
    })
  })

  describe('response: void endpoints', () => {
    const deleteItem = builder().declareEndpoint({
      method: 'DELETE',
      url: '/items/$id',
      response: 'void',
    })

    @Controller()
    class ItemsController {
      @Endpoint(deleteItem)
      async remove() {}
    }

    @Controller()
    class AcceptedController {
      @Endpoint(deleteItem)
      @HttpCode(202)
      async remove() {}
    }

    /** Metadata with the success status the decorators chose. */
    const decoratedMetadata = (controller: ClassType = ItemsController) => {
      const [{ successStatusCode }] = extractControllerMetadata(controller).endpoints
      return { ...createHandlerMetadata(deleteItem.config, 'remove'), successStatusCode }
    }

    it('should answer 204 without a body from a static handler', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue(undefined)
      const formatArguments = vi.fn().mockResolvedValue({ urlParams: { id: '1' } })
      const context = createHandlerContext(decoratedMetadata(), {
        headers: { 'x-custom': 'value' },
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)
      const reply = createMockReply()
      await result.handler(createMockRequest() as any, reply as any)

      expect(boundMethod).toHaveBeenCalledWith({ urlParams: { id: '1' } })
      expect(reply.status).toHaveBeenCalledWith(204)
      expect(reply.headers).toHaveBeenCalledWith({ 'x-custom': 'value' })
      expect(reply.send).toHaveBeenCalledWith()
    })

    it('should not send a value the method returned', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ leaked: true })
      const context = createHandlerContext(decoratedMetadata(), { hasArguments: false })

      const result = adapter.testCreateStaticHandler(boundMethod, vi.fn(), context)
      const reply = createMockReply()
      await result.handler(createMockRequest() as any, reply as any)

      expect(reply.status).toHaveBeenCalledWith(204)
      expect(reply.send).toHaveBeenCalledWith()
    })

    it('should answer 204 without a body from a dynamic handler', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const controller = { remove: vi.fn().mockResolvedValue(undefined) }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(controller),
      }

      for (const hasArguments of [true, false]) {
        const context = createHandlerContext(decoratedMetadata(), { hasArguments })
        const result = adapter.testCreateDynamicHandler(
          resolution,
          vi.fn().mockResolvedValue({ urlParams: { id: '1' } }),
          context,
        )
        const reply = createMockReply()
        await result.handler({} as any, createMockRequest() as any, reply as any)

        expect(reply.status).toHaveBeenCalledWith(204)
        expect(reply.send).toHaveBeenCalledWith()
      }
      expect(controller.remove).toHaveBeenCalledTimes(2)
    })

    it('should use the status set with @HttpCode', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const context = createHandlerContext(decoratedMetadata(AcceptedController))

      const result = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue({}),
        context,
      )
      const reply = createMockReply()
      await result.handler(createMockRequest() as any, reply as any)

      expect(reply.status).toHaveBeenCalledWith(202)
      expect(reply.send).toHaveBeenCalledWith()
    })

    it('should not register a response schema, even if one is declared', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const errorSchema = { 404: z.object({ message: z.string() }) }

      expect(adapter.hasSchema(decoratedMetadata())).toBe(false)
      expect(adapter.provideSchema(decoratedMetadata()).response).toBeUndefined()

      const withSchemas = createHandlerMetadata({
        method: 'DELETE',
        url: '/items/$id',
        response: 'void',
        responseSchema: z.object({ ignored: z.string() }),
        errorSchema,
      })
      const schema = adapter.provideSchema(withSchemas)

      expect(schema.response).toEqual(errorSchema)
      expect(schema.response[200]).toBeUndefined()
    })
  })

  describe('responses endpoints', () => {
    const userSchema = z.object({ id: z.string(), name: z.string() })
    const createdSchema = z.object({ id: z.string() })
    const putUser = builder().declareEndpoint({
      method: 'PUT',
      url: '/users/$id',
      responses: { 200: userSchema, 201: createdSchema, 204: null },
      errorSchema: { 404: z.object({ message: z.string() }) },
    })
    const metadata = () => createHandlerMetadata(putUser.config, 'put')

    it('should send the status and body the method replied with', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const context = createHandlerContext(metadata(), { headers: { 'x-custom': 'value' } })

      for (const [result, status, body] of [
        [coreReply(200, { id: '1', name: 'John' }), 200, { id: '1', name: 'John' }],
        [coreReply(201, { id: '2' }), 201, { id: '2' }],
      ] as const) {
        const handler = adapter.testCreateStaticHandler(
          vi.fn().mockResolvedValue(result),
          vi.fn().mockResolvedValue({ urlParams: { id: '1' } }),
          context,
        )
        const reply = createMockReply()
        await handler.handler(createMockRequest() as any, reply as any)

        expect(reply.status).toHaveBeenCalledWith(status)
        expect(reply.headers).toHaveBeenCalledWith({ 'x-custom': 'value' })
        expect(reply.send).toHaveBeenCalledWith(body)
      }
    })

    it('should send no body for a null entry', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const handler = adapter.testCreateStaticHandler(
        // A body passed by mistake (not type-safe) must not be sent
        vi.fn().mockResolvedValue(coreReply(204, { leaked: true })),
        vi.fn(),
        createHandlerContext(metadata(), { hasArguments: false }),
      )
      const reply = createMockReply()
      await handler.handler(createMockRequest() as any, reply as any)

      expect(reply.status).toHaveBeenCalledWith(204)
      expect(reply.send).toHaveBeenCalledWith()
    })

    it('should ignore the handler success status', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const handler = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue(coreReply(201, { id: '2' })),
        vi.fn().mockResolvedValue({}),
        createHandlerContext({ ...metadata(), successStatusCode: 202 }),
      )
      const reply = createMockReply()
      await handler.handler(createMockRequest() as any, reply as any)

      expect(reply.status).toHaveBeenCalledWith(201)
      expect(reply.status).not.toHaveBeenCalledWith(202)
    })

    it('should work from a dynamic handler', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const controller = { put: vi.fn().mockResolvedValue(coreReply(201, { id: '2' })) }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(controller),
      }

      for (const hasArguments of [true, false]) {
        const handler = adapter.testCreateDynamicHandler(
          resolution,
          vi.fn().mockResolvedValue({ urlParams: { id: '1' } }),
          createHandlerContext(metadata(), { hasArguments }),
        )
        const reply = createMockReply()
        await handler.handler({} as any, createMockRequest() as any, reply as any)

        expect(reply.status).toHaveBeenCalledWith(201)
        expect(reply.send).toHaveBeenCalledWith({ id: '2' })
      }
    })

    it('should throw when the method did not return a reply', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const handler = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue({ id: '1', name: 'John' }),
        vi.fn().mockResolvedValue({}),
        createHandlerContext(metadata()),
      )
      const reply = createMockReply()

      await expect(handler.handler(createMockRequest() as any, reply as any)).rejects.toThrow(
        '[Navios] PUT /users/$id is declared with a per-status responses map, so its handler must return reply(status, body), but it returned a value of type object.',
      )
      expect(reply.send).not.toHaveBeenCalled()
    })

    it('should throw when the status is not declared', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const handler = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue(coreReply(404, { message: 'missing' })),
        vi.fn().mockResolvedValue({}),
        createHandlerContext(metadata()),
      )
      const reply = createMockReply()

      await expect(handler.handler(createMockRequest() as any, reply as any)).rejects.toThrow(
        '[Navios] PUT /users/$id replied with status 404, which is not in its responses map (declared: 200, 201, 204).',
      )
      expect(reply.send).not.toHaveBeenCalled()
    })

    it('should register a response schema for each status that has one', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyEndpointAdapterService)

      expect(adapter.hasSchema(metadata())).toBe(true)
      expect(adapter.provideSchema(metadata()).response).toEqual({
        200: userSchema,
        201: createdSchema,
        404: putUser.config.errorSchema[404],
      })
    })

    it('should register no response schema when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)

      expect(adapter.hasSchema(metadata())).toBe(false)
      expect(adapter.provideSchema(metadata()).response).toBeUndefined()
    })

    it('should register no success schema when every status is bodiless', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const bodiless = createHandlerMetadata({
        method: 'POST',
        url: '/ping',
        responses: { 202: null, 204: null },
      })

      expect(adapter.hasSchema(bodiless)).toBe(false)
      expect(adapter.provideSchema(bodiless).response).toBeUndefined()
    })
  })
})
