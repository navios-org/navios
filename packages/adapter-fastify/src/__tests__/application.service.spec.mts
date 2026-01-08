import { ErrorResponseProducerService } from '@navios/core'
import { TestContainer } from '@navios/core/testing'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FastifyControllerAdapterService,
  FastifyValidatorCompilerService,
} from '../index.mjs'
import { FastifyApplicationServiceToken } from '../tokens/index.mjs'

// Mock services
// @ts-expect-error - Mocking the service
const mockErrorProducer: ErrorResponseProducerService = {
  respond: vi.fn(),
  handleUnknown: vi.fn(),
  notFound: vi.fn(),
  validationError: vi.fn(),
  internalServerError: vi.fn(),
  forbidden: vi.fn(),
}

const mockValidatorCompiler: FastifyValidatorCompilerService = {
  errorCompiler: vi.fn(),
}

const mockControllerAdapter = {
  setupController: vi.fn(),
}

const mockLogger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// Mock Fastify instance factory
const createMockFastifyInstance = () => ({
  register: vi.fn().mockImplementation(async () => {}),
  setErrorHandler: vi.fn().mockReturnThis(),
  setNotFoundHandler: vi.fn().mockReturnThis(),
  setValidatorCompiler: vi.fn().mockReturnThis(),
  setSerializerCompiler: vi.fn().mockReturnThis(),
  decorateRequest: vi.fn().mockReturnThis(),
  addHook: vi.fn().mockReturnThis(),
  listen: vi.fn().mockResolvedValue('http://localhost:3000'),
  close: vi.fn().mockResolvedValue(undefined),
  ready: vi.fn().mockResolvedValue(undefined),
  route: vi.fn(),
})

// Mock fastify module
vi.mock('fastify', () => ({
  fastify: vi.fn(() => createMockFastifyInstance()),
}))

vi.mock('@fastify/cors', () => ({
  default: vi.fn(),
}))

vi.mock('@fastify/multipart', () => ({
  default: vi.fn(),
}))

vi.mock('fastify-type-provider-zod', () => ({
  serializerCompiler: vi.fn(),
}))

describe('FastifyApplicationService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    container.bind(ErrorResponseProducerService).toValue(mockErrorProducer)
    container
      .bind(FastifyValidatorCompilerService)
      .toValue(mockValidatorCompiler)
    container
      .bind(FastifyControllerAdapterService)
      .toValue(
        mockControllerAdapter as unknown as FastifyControllerAdapterService,
      )
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('setGlobalPrefix / getGlobalPrefix', () => {
    it('should set and get global prefix', async () => {
      const service = await container.get(FastifyApplicationServiceToken)

      expect(service.getGlobalPrefix()).toBe('')

      service.setGlobalPrefix('/api/v1')

      expect(service.getGlobalPrefix()).toBe('/api/v1')
    })

    it('should allow changing prefix', async () => {
      const service = await container.get(FastifyApplicationServiceToken)

      service.setGlobalPrefix('/api/v1')
      expect(service.getGlobalPrefix()).toBe('/api/v1')

      service.setGlobalPrefix('/api/v2')
      expect(service.getGlobalPrefix()).toBe('/api/v2')
    })
  })

  describe('getServer', () => {
    it('should throw when server is not initialized', async () => {
      const service = await container.get(FastifyApplicationServiceToken)

      expect(() => service.getServer()).toThrow('Server is not initialized')
    })

    it('should return server after initialization', async () => {
      const mockServer = createMockFastifyInstance()

      const service = await container.get(FastifyApplicationServiceToken)
      // Set server after instantiation (class field initializers run after constructor)
      ;(service as any).server = mockServer

      const server = service.getServer()

      expect(server).toBe(mockServer)
    })
  })

  describe('enableCors', () => {
    it('should store CORS options', async () => {
      const service = await container.get(FastifyApplicationServiceToken)
      const corsOptions = { origin: true, credentials: true }

      service.enableCors(corsOptions)

      expect((service as any).corsOptions).toEqual(corsOptions)
    })
  })

  describe('enableMultipart', () => {
    it('should store multipart options', async () => {
      const service = await container.get(FastifyApplicationServiceToken)
      const multipartOptions = { limits: { fileSize: 10 * 1024 * 1024 } }

      service.enableMultipart(multipartOptions)

      expect((service as any).multipartOptions).toEqual(multipartOptions)
    })
  })

  describe('listen', () => {
    it('should start listening on specified port', async () => {
      const mockServer = createMockFastifyInstance()
      mockServer.listen.mockResolvedValue('http://localhost:3000')

      const service = await container.get(FastifyApplicationServiceToken)
      // Set server and logger after instantiation (class field initializers run after constructor)
      ;(service as any).server = mockServer
      ;(service as any).logger = mockLogger

      const address = await service.listen({ port: 3000 })

      expect(address).toBe('http://localhost:3000')
      expect(mockServer.listen).toHaveBeenCalledWith({ port: 3000 })
      expect(mockLogger.debug).toHaveBeenCalled()
    })

    it('should listen with host option', async () => {
      const mockServer = createMockFastifyInstance()
      mockServer.listen.mockResolvedValue('http://0.0.0.0:8080')

      const service = await container.get(FastifyApplicationServiceToken)
      // Set server after instantiation (class field initializers run after constructor)
      ;(service as any).server = mockServer

      const address = await service.listen({ port: 8080, host: '0.0.0.0' })

      expect(address).toBe('http://0.0.0.0:8080')
      expect(mockServer.listen).toHaveBeenCalledWith({
        port: 8080,
        host: '0.0.0.0',
      })
    })
  })

  describe('dispose', () => {
    it('should close the server', async () => {
      const mockServer = createMockFastifyInstance()

      const service = await container.get(FastifyApplicationServiceToken)
      // Set server after instantiation (class field initializers run after constructor)
      ;(service as any).server = mockServer

      await service.dispose()

      expect(mockServer.close).toHaveBeenCalled()
    })
  })

  describe('ready', () => {
    it('should call server ready', async () => {
      const mockServer = createMockFastifyInstance()

      const service = await container.get(FastifyApplicationServiceToken)
      // Set server after instantiation (class field initializers run after constructor)
      ;(service as any).server = mockServer

      await service.ready()

      expect(mockServer.ready).toHaveBeenCalled()
    })
  })

  describe('onModulesInit', () => {
    it('should register routes for modules with controllers', async () => {
      const mockServer = createMockFastifyInstance()

      const service = await container.get(FastifyApplicationServiceToken)
      // Set server and globalPrefix after instantiation
      ;(service as any).server = mockServer
      ;(service as any).globalPrefix = '/api'

      class TestController {}

      const modules = new Map([
        [
          'TestModule',
          {
            controllers: new Set([TestController]),
            providers: [],
            imports: [],
          },
        ],
      ])

      await service.onModulesInit(modules as any)

      expect(mockServer.register).toHaveBeenCalledWith(expect.any(Function), {
        prefix: '/api',
      })
    })

    it('should skip modules without controllers', async () => {
      const mockServer = createMockFastifyInstance()

      const service = await container.get(FastifyApplicationServiceToken)
      // Set server after instantiation
      ;(service as any).server = mockServer

      const modules = new Map([
        [
          'EmptyModule',
          {
            controllers: new Set(),
            providers: [],
            imports: [],
          },
        ],
      ])

      await service.onModulesInit(modules as any)

      expect(mockServer.register).not.toHaveBeenCalled()
    })

    it('should skip modules with undefined controllers', async () => {
      const mockServer = createMockFastifyInstance()

      const service = await container.get(FastifyApplicationServiceToken)
      // Set server after instantiation
      ;(service as any).server = mockServer

      const modules = new Map([
        [
          'NoControllersModule',
          {
            providers: [],
            imports: [],
          },
        ],
      ])

      await service.onModulesInit(modules as any)

      expect(mockServer.register).not.toHaveBeenCalled()
    })
  })
})
