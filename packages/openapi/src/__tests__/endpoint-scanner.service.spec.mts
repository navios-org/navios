import type { BaseEndpointOptions } from '@navios/builder'
import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '@navios/core'

import { Logger } from '@navios/core'
import { TestContainer } from '@navios/di/testing'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EndpointScannerService } from '../services/endpoint-scanner.service.mjs'
import { MetadataExtractorService } from '../services/metadata-extractor.service.mjs'

// Mock metadata extractor
const mockMetadataExtractor = {
  extract: vi.fn().mockReturnValue({
    tags: ['default'],
    summary: '',
    description: '',
    operationId: '',
    deprecated: false,
    excluded: false,
    security: [],
  }),
}

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// Mock extractControllerMetadata
vi.mock('@navios/core', async () => {
  const actual = await vi.importActual('@navios/core')
  return {
    ...actual,
    extractControllerMetadata: vi.fn((controller) => controller.__metadata),
  }
})

const createHandlerMetadata = (
  config: Partial<BaseEndpointOptions> | undefined,
  classMethod = 'test',
): HandlerMetadata<any> => ({
  classMethod,
  url: config?.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config?.method ?? 'GET',
  config: config as BaseEndpointOptions,
  guards: new Set(),
  customAttributes: new Map(),
})

describe('EndpointScannerService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    // Bind required dependencies
    container.bind(Logger).toValue(mockLogger as any)
    container
      .bind(MetadataExtractorService)
      .toValue(mockMetadataExtractor as any)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('scan', () => {
    it('should discover endpoints from modules', async () => {
      const scanner = await container.get(EndpointScannerService)

      // Create mock handler metadata
      const handler = createHandlerMetadata(
        {
          method: 'GET',
          url: '/users',
        },
        'getUsers',
      )

      // Create mock controller metadata
      const controllerMeta: ControllerMetadata = {
        endpoints: new Set([handler]),
        guards: new Set(),
        customAttributes: new Map(),
      }

      // Create mock controller class with attached metadata
      class TestController {
        static __metadata = controllerMeta
      }

      // Create mock module metadata
      const moduleMetadata: ModuleMetadata = {
        controllers: new Set([TestController as any]),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }

      const modules = new Map([['TestModule', moduleMetadata]])

      const endpoints = scanner.scan(modules)

      expect(endpoints).toHaveLength(1)
      expect(endpoints[0].handler).toBe(handler)
      expect(endpoints[0].module).toBe(moduleMetadata)
      expect(mockLogger.debug).toHaveBeenCalled()
    })

    it('should skip modules without controllers', async () => {
      const scanner = await container.get(EndpointScannerService)

      const moduleMetadata: ModuleMetadata = {
        controllers: new Set(),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }

      const modules = new Map([['EmptyModule', moduleMetadata]])

      const endpoints = scanner.scan(modules)

      expect(endpoints).toHaveLength(0)
    })

    it('should skip modules with undefined controllers', async () => {
      const scanner = await container.get(EndpointScannerService)

      const moduleMetadata: ModuleMetadata = {
        controllers: new Set(),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }

      const modules = new Map([['NoControllerModule', moduleMetadata]])

      const endpoints = scanner.scan(modules)

      expect(endpoints).toHaveLength(0)
    })

    it('should skip endpoints without config', async () => {
      const scanner = await container.get(EndpointScannerService)

      // Handler without config
      const handler = createHandlerMetadata(undefined, 'noConfigMethod')

      const controllerMeta: ControllerMetadata = {
        endpoints: new Set([handler]),
        guards: new Set(),
        customAttributes: new Map(),
      }

      class TestController {
        static __metadata = controllerMeta
      }

      const moduleMetadata: ModuleMetadata = {
        controllers: new Set([TestController as any]),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }

      const modules = new Map([['TestModule', moduleMetadata]])

      const endpoints = scanner.scan(modules)

      expect(endpoints).toHaveLength(0)
    })

    it('should skip excluded endpoints', async () => {
      const excludedExtractor = {
        extract: vi.fn().mockReturnValue({
          tags: [],
          excluded: true, // Excluded
        }),
      }
      await container.invalidate(mockMetadataExtractor as any)
      container.bind(MetadataExtractorService).toValue(excludedExtractor as any)

      const scanner = await container.get(EndpointScannerService)

      const handler = createHandlerMetadata(
        {
          method: 'GET',
          url: '/excluded',
        },
        'excludedMethod',
      )

      const controllerMeta: ControllerMetadata = {
        endpoints: new Set([handler]),
        guards: new Set(),
        customAttributes: new Map(),
      }

      class TestController {
        static __metadata = controllerMeta
      }

      const moduleMetadata: ModuleMetadata = {
        controllers: new Set([TestController as any]),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }

      const modules = new Map([['TestModule', moduleMetadata]])

      const endpoints = scanner.scan(modules)

      expect(endpoints).toHaveLength(0)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping excluded'),
      )
    })

    it('should scan multiple modules and controllers', async () => {
      const scanner = await container.get(EndpointScannerService)

      // Module 1, Controller 1
      const handler1 = createHandlerMetadata(
        { method: 'GET', url: '/users' },
        'getUsers',
      )

      const controllerMeta1: ControllerMetadata = {
        endpoints: new Set([handler1]),
        guards: new Set(),
        customAttributes: new Map(),
      }

      class Controller1 {
        static __metadata = controllerMeta1
      }

      // Module 1, Controller 2
      const handler2 = createHandlerMetadata(
        { method: 'POST', url: '/posts' },
        'createPost',
      )

      const controllerMeta2: ControllerMetadata = {
        endpoints: new Set([handler2]),
        guards: new Set(),
        customAttributes: new Map(),
      }

      class Controller2 {
        static __metadata = controllerMeta2
      }

      const module1: ModuleMetadata = {
        controllers: new Set([Controller1 as any, Controller2 as any]),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }

      // Module 2
      const handler3 = createHandlerMetadata(
        { method: 'GET', url: '/orders' },
        'getOrders',
      )

      const controllerMeta3: ControllerMetadata = {
        endpoints: new Set([handler3]),
        guards: new Set(),
        customAttributes: new Map(),
      }

      class Controller3 {
        static __metadata = controllerMeta3
      }

      const module2: ModuleMetadata = {
        controllers: new Set([Controller3 as any]),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }

      const modules = new Map([
        ['Module1', module1],
        ['Module2', module2],
      ])

      const endpoints = scanner.scan(modules)

      expect(endpoints).toHaveLength(3)
    })

    it('should extract openApiMetadata for each endpoint', async () => {
      const customMetadata = {
        tags: ['users', 'api'],
        summary: 'Get all users',
        description: 'Returns a list of users',
        operationId: 'getUsers',
        deprecated: false,
        excluded: false,
        security: [{ bearer: [] }],
      }

      const customExtractor = {
        extract: vi.fn().mockReturnValue(customMetadata),
      }
      await container.invalidate(mockMetadataExtractor as any)
      container.bind(MetadataExtractorService).toValue(customExtractor as any)

      const scanner = await container.get(EndpointScannerService)

      const handler = createHandlerMetadata(
        { method: 'GET', url: '/users' },
        'getUsers',
      )

      const controllerMeta: ControllerMetadata = {
        endpoints: new Set([handler]),
        guards: new Set(),
        customAttributes: new Map(),
      }

      class TestController {
        static __metadata = controllerMeta
      }

      const moduleMetadata: ModuleMetadata = {
        controllers: new Set([TestController as any]),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }

      const modules = new Map([['TestModule', moduleMetadata]])

      const endpoints = scanner.scan(modules)

      expect(endpoints[0].openApiMetadata).toEqual(customMetadata)
    })
  })
})
