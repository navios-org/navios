import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  extractControllerMetadata,
  HttpCode,
  NaviosOptionsToken,
  reply,
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

import { BunEndpointAdapterService } from '../adapters/endpoint-adapter.service.mjs'

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

// Mock BunRequest type
interface MockBunRequest {
  url: string
  method: string
  headers: Headers
  json: () => Promise<any>
  text: () => Promise<string>
}

const createMockBunRequest = (overrides: Partial<MockBunRequest> = {}): MockBunRequest => ({
  url: 'http://localhost:3000/test',
  method: 'GET',
  headers: new Headers(),
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  ...overrides,
})

const createHandlerMetadata = <T extends ZodBaseEndpointOptions>(
  config: Partial<T>,
  classMethod = 'test',
): HandlerMetadata<T> => ({
  classMethod,
  url: config.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config.method ?? 'GET',
  config: config as T,
  guards: new Set(),
  customAttributes: new Map(),
})

const createHandlerContext = <T extends ZodBaseEndpointOptions>(
  handlerMetadata: HandlerMetadata<T>,
  overrides: Partial<HandlerContext<T>> = {},
): HandlerContext<T> => ({
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
class TestBunEndpointAdapter extends BunEndpointAdapterService {
  testBuildHeaders(context: HandlerContext<ZodBaseEndpointOptions>) {
    return this.buildHeaders(context)
  }

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

  testBuildResponseFormatter(context: HandlerContext<ZodBaseEndpointOptions>) {
    return this.buildResponseFormatter(context)
  }
}

describe('BunEndpointAdapterService', () => {
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

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      } as ZodBaseEndpointOptions)

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      } as ZodBaseEndpointOptions)

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })

    it('should return true when requestSchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
        requestSchema: z.object({ name: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return true when querySchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        querySchema: z.object({ page: z.number() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when no schemas exist', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })
  })

  describe('provideSchema', () => {
    it('should return empty object for Bun', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        requestSchema: z.object({ name: z.string() }),
        responseSchema: z.object({ id: z.string() }),
      } as ZodBaseEndpointOptions)

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema).toEqual({})
    })
  })

  describe('buildHeaders', () => {
    it('should include Content-Type application/json', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      } as ZodBaseEndpointOptions)
      handlerMetadata.headers = { 'X-Custom': 'value' }
      const context = createHandlerContext(handlerMetadata)

      const headers = adapter.testBuildHeaders(context)

      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['X-Custom']).toBe('value')
    })
  })

  describe('createStaticHandler', () => {
    it('should create static handler that returns JSON response', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ id: '123', name: 'test' })
      const formatArguments = vi.fn().mockResolvedValue({ data: { input: 'value' } })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
      } as ZodBaseEndpointOptions)
      const context = createHandlerContext(handlerMetadata, {
        hasArguments: true,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)

      expect(result.isStatic).toBe(true)
      expect(typeof result.handler).toBe('function')

      const request = createMockBunRequest()
      const response = await result.handler(request as any)

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = await response.json()
      expect(body).toEqual({ id: '123', name: 'test' })
    })

    it('should validate response when responseSchema is provided', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const responseSchema = z.object({
        id: z.string(),
        name: z.string(),
      })
      const boundMethod = vi.fn().mockResolvedValue({ id: '123', name: 'test' })
      const formatArguments = vi.fn().mockResolvedValue({})
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
      } as ZodBaseEndpointOptions)
      const context = createHandlerContext(handlerMetadata, {
        hasArguments: false,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)
      const request = createMockBunRequest()
      const response = await result.handler(request as any)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ id: '123', name: 'test' })
    })

    it('should use custom status code', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ created: true })
      const formatArguments = vi.fn().mockResolvedValue({})
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
        responseSchema: z.object({ created: z.boolean() }),
      } as ZodBaseEndpointOptions)
      handlerMetadata.successStatusCode = 201
      const context = createHandlerContext(handlerMetadata, {
        statusCode: 201,
        hasArguments: false,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)
      const request = createMockBunRequest()
      const response = await result.handler(request as any)

      expect(response.status).toBe(201)
    })
  })

  describe('createDynamicHandler', () => {
    it('should create dynamic handler that resolves controller', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const mockController = {
        testMethod: vi.fn().mockResolvedValue({ id: '456' }),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn().mockResolvedValue({ data: { input: 'test' } })
      const handlerMetadata = createHandlerMetadata(
        {
          method: 'GET',
          url: '/test',
          responseSchema: z.object({ id: z.string() }),
        } as ZodBaseEndpointOptions,
        'testMethod',
      )
      const context = createHandlerContext(handlerMetadata, {
        hasArguments: true,
      })

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)

      expect(result.isStatic).toBe(false)
      expect(typeof result.handler).toBe('function')

      const scopedContainer = {}
      const request = createMockBunRequest()
      const response = await result.handler(scopedContainer as any, request as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(mockController.testMethod).toHaveBeenCalledWith({
        data: { input: 'test' },
      })
      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body).toEqual({ id: '456' })
    })

    it('should validate response with schema in dynamic handler', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const responseSchema = z.object({ id: z.string() })
      const mockController = {
        method: vi.fn().mockResolvedValue({ id: '789' }),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn().mockResolvedValue({})
      const handlerMetadata = createHandlerMetadata(
        {
          method: 'GET',
          url: '/test',
          responseSchema,
        } as ZodBaseEndpointOptions,
        'method',
      )
      const context = createHandlerContext(handlerMetadata, {
        hasArguments: false,
      })

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)
      const request = createMockBunRequest()
      const response = await result.handler({} as any, request as any)

      const body = await response.json()
      expect(body).toEqual({ id: '789' })
    })
  })

  describe('buildResponseFormatter', () => {
    it('should return identity function when no responseSchema', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.any(),
      } as ZodBaseEndpointOptions)
      // Remove responseSchema from config to test identity function
      ;(handlerMetadata.config as any).responseSchema = undefined
      const context = createHandlerContext(handlerMetadata)

      const formatter = adapter.testBuildResponseFormatter(context)
      const input = { foo: 'bar' }

      expect(formatter(input)).toBe(input)
    })

    it('should validate when responseSchema exists and validateResponses is true', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const responseSchema = z.object({ id: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
      } as ZodBaseEndpointOptions)
      const context = createHandlerContext(handlerMetadata)

      const formatter = adapter.testBuildResponseFormatter(context)

      expect(formatter({ id: '123' })).toEqual({ id: '123' })
      expect(() => formatter({ id: 123 })).toThrow()
    })

    it('should skip validation when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const responseSchema = z.object({ id: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
      } as ZodBaseEndpointOptions)
      const context = createHandlerContext(handlerMetadata)

      const formatter = adapter.testBuildResponseFormatter(context)
      const input = { id: 123 } // Invalid according to schema

      // Should not throw because validation is disabled
      expect(formatter(input)).toBe(input)
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
      return {
        ...createHandlerMetadata<ZodBaseEndpointOptions>(deleteItem.config, 'remove'),
        successStatusCode,
      }
    }

    it('should answer 204 without a body or Content-Type from a static handler', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue(undefined)
      const formatArguments = vi.fn().mockResolvedValue({ urlParams: { id: '1' } })
      const context = createHandlerContext(decoratedMetadata(), {
        headers: { 'x-custom': 'value' },
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)
      const response: Response = await result.handler(createMockBunRequest() as any)

      expect(boundMethod).toHaveBeenCalledWith({ urlParams: { id: '1' } })
      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
      expect(await response.text()).toBe('')
      expect(response.headers.get('Content-Type')).toBeNull()
      expect(response.headers.get('x-custom')).toBe('value')
    })

    it('should not send a value the method returned', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const context = createHandlerContext(decoratedMetadata())

      const result = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue({ leaked: true }),
        vi.fn().mockResolvedValue({}),
        context,
      )
      const response: Response = await result.handler(createMockBunRequest() as any)

      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
    })

    it('should skip response validation even if a responseSchema is declared', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      // `undefined` does not satisfy this schema, so validating would throw
      const responseSchema = z.object({ id: z.string() })
      const handlerMetadata = {
        ...decoratedMetadata(),
        config: { ...deleteItem.config, responseSchema },
      }
      const context = createHandlerContext<ZodBaseEndpointOptions>(handlerMetadata)

      const result = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue({}),
        context,
      )
      const response: Response = await result.handler(createMockBunRequest() as any)

      expect(response.status).toBe(204)
      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })

    it('should answer 204 without a body from a dynamic handler', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const controller = { remove: vi.fn().mockResolvedValue(undefined) }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(controller),
      }
      const context = createHandlerContext(decoratedMetadata())

      const result = adapter.testCreateDynamicHandler(
        resolution,
        vi.fn().mockResolvedValue({ urlParams: { id: '1' } }),
        context,
      )
      const response: Response = await result.handler({} as any, createMockBunRequest() as any)

      expect(controller.remove).toHaveBeenCalledWith({ urlParams: { id: '1' } })
      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
      expect(response.headers.get('Content-Type')).toBeNull()
    })

    it('should use the status set with @HttpCode', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const context = createHandlerContext(decoratedMetadata(AcceptedController))

      const result = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue({}),
        context,
      )
      const response: Response = await result.handler(createMockBunRequest() as any)

      expect(response.status).toBe(202)
      expect(await response.text()).toBe('')
    })
  })

  describe('responses endpoints', () => {
    const userSchema = z.object({ id: z.string(), name: z.string() })
    const createdSchema = z.object({ id: z.string() })
    const putUser = builder().declareEndpoint({
      method: 'PUT',
      url: '/users/$id',
      responses: { 200: userSchema, 201: createdSchema, 204: null },
    })
    const metadata = () => createHandlerMetadata<ZodBaseEndpointOptions>(putUser.config, 'put')

    const respond = async (
      adapter: TestBunEndpointAdapter,
      result: unknown,
      handlerMetadata = metadata(),
    ): Promise<Response> => {
      const handler = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue(result),
        vi.fn().mockResolvedValue({ urlParams: { id: '1' } }),
        createHandlerContext(handlerMetadata, { headers: { 'x-custom': 'value' } }),
      )
      return handler.handler(createMockBunRequest() as any)
    }

    it('should send the status and body the method replied with', async () => {
      bindNaviosOptions(container, { validateResponses: true })
      const adapter = await container.get(TestBunEndpointAdapter)

      const ok = await respond(adapter, reply(200, { id: '1', name: 'John' }))
      expect(ok.status).toBe(200)
      expect(ok.headers.get('Content-Type')).toBe('application/json')
      expect(ok.headers.get('x-custom')).toBe('value')
      expect(await ok.json()).toEqual({ id: '1', name: 'John' })

      const created = await respond(adapter, reply(201, { id: '2' }))
      expect(created.status).toBe(201)
      expect(await created.json()).toEqual({ id: '2' })
    })

    it('should send no body or Content-Type for a null entry', async () => {
      bindNaviosOptions(container, { validateResponses: true })
      const adapter = await container.get(TestBunEndpointAdapter)

      // A body passed by mistake (not type-safe) must not be sent
      const response = await respond(adapter, reply(204, { leaked: true }))

      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
      expect(await response.text()).toBe('')
      expect(response.headers.get('Content-Type')).toBeNull()
      expect(response.headers.get('x-custom')).toBe('value')
    })

    it('should validate the body with the schema of its status', async () => {
      bindNaviosOptions(container, { validateResponses: true })
      const adapter = await container.get(TestBunEndpointAdapter)

      // Unknown keys are stripped by the schema of status 201
      const created = await respond(adapter, reply(201, { id: '2', secret: 'x' }))
      expect(await created.json()).toEqual({ id: '2' })

      // The body of status 201 does not satisfy the schema of status 200
      await expect(respond(adapter, reply(200, { id: '2' }))).rejects.toThrow()
    })

    it('should skip validation when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })
      const adapter = await container.get(TestBunEndpointAdapter)

      const response = await respond(adapter, reply(200, { id: '2', secret: 'x' }))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ id: '2', secret: 'x' })
    })

    it('should ignore the handler success status', async () => {
      bindNaviosOptions(container, { validateResponses: true })
      const adapter = await container.get(TestBunEndpointAdapter)

      const response = await respond(adapter, reply(201, { id: '2' }), {
        ...metadata(),
        successStatusCode: 202,
      })

      expect(response.status).toBe(201)
    })

    it('should work from a dynamic handler', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const controller = { put: vi.fn().mockResolvedValue(reply(201, { id: '2' })) }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(controller),
      }

      const handler = adapter.testCreateDynamicHandler(
        resolution,
        vi.fn().mockResolvedValue({ urlParams: { id: '1' } }),
        createHandlerContext(metadata()),
      )
      const response: Response = await handler.handler({} as any, createMockBunRequest() as any)

      expect(controller.put).toHaveBeenCalledWith({ urlParams: { id: '1' } })
      expect(response.status).toBe(201)
      expect(await response.json()).toEqual({ id: '2' })
    })

    it('should throw when the method did not return a reply', async () => {
      bindNaviosOptions(container, { validateResponses: true })
      const adapter = await container.get(TestBunEndpointAdapter)

      await expect(respond(adapter, { id: '1', name: 'John' })).rejects.toThrow(
        '[Navios] PUT /users/$id is declared with a per-status responses map, so its handler must return reply(status, body), but it returned a value of type object.',
      )
    })

    it('should throw when the status is not declared', async () => {
      bindNaviosOptions(container, { validateResponses: true })
      const adapter = await container.get(TestBunEndpointAdapter)

      await expect(respond(adapter, reply(404, { message: 'missing' }))).rejects.toThrow(
        '[Navios] PUT /users/$id replied with status 404, which is not in its responses map (declared: 200, 201, 204).',
      )
    })

    it('should report a schema only when a status has one', async () => {
      bindNaviosOptions(container, { validateResponses: true })
      const adapter = await container.get(TestBunEndpointAdapter)

      expect(adapter.hasSchema(metadata())).toBe(true)
      expect(
        adapter.hasSchema(
          createHandlerMetadata<ZodBaseEndpointOptions>({
            method: 'POST',
            url: '/ping',
            responses: { 202: null, 204: null },
          }),
        ),
      ).toBe(false)
    })
  })
})
