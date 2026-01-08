import type { ModuleMetadata } from '@navios/core'

import { Logger } from '@navios/core'
import { TestContainer } from '@navios/di/testing'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DiscoveredEndpoint } from '../services/endpoint-scanner.service.mjs'
import type { OpenApiGeneratorOptions } from '../services/openapi-generator.service.mjs'

import { EndpointScannerService } from '../services/endpoint-scanner.service.mjs'
import { OpenApiGeneratorService } from '../services/openapi-generator.service.mjs'
import { PathBuilderService } from '../services/path-builder.service.mjs'

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// Mock scanner
const mockScanner = {
  scan: vi.fn().mockReturnValue([]),
}

// Mock path builder
const mockPathBuilder = {
  build: vi.fn().mockReturnValue({
    path: '/test',
    pathItem: { get: { responses: { 200: { description: 'OK' } } } },
  }),
}

describe('OpenApiGeneratorService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    // Bind required dependencies
    container.bind(Logger).toValue(mockLogger as any)
    container.bind(EndpointScannerService).toValue(mockScanner as any)
    container.bind(PathBuilderService).toValue(mockPathBuilder as any)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('generate', () => {
    it('should generate basic OpenAPI document', async () => {
      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
      }

      const document = generator.generate(modules, options)

      expect(document.openapi).toBe('3.1.0')
      expect(document.info.title).toBe('Test API')
      expect(document.info.version).toBe('1.0.0')
      expect(document.paths).toBeDefined()
    })

    it('should include optional info fields', async () => {
      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
          description: 'A test API',
          termsOfService: 'https://example.com/terms',
          contact: {
            name: 'Support',
            email: 'support@example.com',
            url: 'https://example.com',
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT',
          },
        },
      }

      const document = generator.generate(modules, options)

      expect(document.info.description).toBe('A test API')
      expect(document.info.termsOfService).toBe('https://example.com/terms')
      expect(document.info.contact?.name).toBe('Support')
      expect(document.info.license?.name).toBe('MIT')
    })

    it('should include servers when provided', async () => {
      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        servers: [
          { url: 'https://api.example.com', description: 'Production' },
          { url: 'https://staging.example.com', description: 'Staging' },
        ],
      }

      const document = generator.generate(modules, options)

      expect(document.servers).toHaveLength(2)
      expect(document.servers?.[0].url).toBe('https://api.example.com')
      expect(document.servers?.[1].description).toBe('Staging')
    })

    it('should not include servers when empty array', async () => {
      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        servers: [],
      }

      const document = generator.generate(modules, options)

      expect(document.servers).toBeUndefined()
    })

    it('should include external docs when provided', async () => {
      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        externalDocs: {
          url: 'https://docs.example.com',
          description: 'Full documentation',
        },
      }

      const document = generator.generate(modules, options)

      expect(document.externalDocs?.url).toBe('https://docs.example.com')
      expect(document.externalDocs?.description).toBe('Full documentation')
    })

    it('should include security schemes when provided', async () => {
      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      }

      const document = generator.generate(modules, options)

      expect(document.components?.securitySchemes).toBeDefined()
      const bearerAuth = document.components?.securitySchemes?.bearerAuth
      const apiKey = document.components?.securitySchemes?.apiKey
      expect(
        bearerAuth && 'type' in bearerAuth ? bearerAuth.type : undefined,
      ).toBe('http')
      expect(apiKey && 'type' in apiKey ? apiKey.type : undefined).toBe(
        'apiKey',
      )
    })

    it('should include global security requirements', async () => {
      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        security: [{ bearerAuth: [] }],
      }

      const document = generator.generate(modules, options)

      expect(document.security).toHaveLength(1)
      expect(document.security?.[0]).toEqual({ bearerAuth: [] })
    })

    it('should build paths from discovered endpoints', async () => {
      const mockEndpoints: DiscoveredEndpoint[] = [
        {
          module: {} as any,
          controllerClass: class {},
          controller: {} as any,
          handler: { config: { method: 'GET', url: '/users' } } as any,
          config: { method: 'GET', url: '/users' },
          openApiMetadata: {
            tags: ['users'],
            summary: '',
            description: '',
            operationId: '',
            deprecated: false,
            excluded: false,
            security: [],
          },
        },
      ]

      mockScanner.scan.mockReturnValue(mockEndpoints)
      mockPathBuilder.build.mockReturnValue({
        path: '/users',
        pathItem: {
          get: { tags: ['users'], responses: { 200: { description: 'OK' } } },
        },
      })

      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
      }

      const document = generator.generate(modules, options)

      expect(mockScanner.scan).toHaveBeenCalledWith(modules)
      expect(mockPathBuilder.build).toHaveBeenCalledWith(mockEndpoints[0])
      expect(document.paths?.['/users']).toBeDefined()
    })

    it('should merge paths with different methods', async () => {
      const mockEndpoints: DiscoveredEndpoint[] = [
        {
          module: {} as any,
          controllerClass: class {},
          controller: {} as any,
          handler: { config: { method: 'GET', url: '/users' } } as any,
          config: { method: 'GET', url: '/users' },
          openApiMetadata: { tags: ['users'], excluded: false } as any,
        },
        {
          module: {} as any,
          controllerClass: class {},
          controller: {} as any,
          handler: { config: { method: 'POST', url: '/users' } } as any,
          config: { method: 'POST', url: '/users' },
          openApiMetadata: { tags: ['users'], excluded: false } as any,
        },
      ]

      mockScanner.scan.mockReturnValue(mockEndpoints)
      mockPathBuilder.build
        .mockReturnValueOnce({
          path: '/users',
          pathItem: { get: { responses: { 200: { description: 'OK' } } } },
        })
        .mockReturnValueOnce({
          path: '/users',
          pathItem: {
            post: { responses: { 201: { description: 'Created' } } },
          },
        })

      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
      }

      const document = generator.generate(modules, options)

      expect(document.paths?.['/users']?.get).toBeDefined()
      expect(document.paths?.['/users']?.post).toBeDefined()
    })

    it('should collect and merge tags', async () => {
      const mockEndpoints: DiscoveredEndpoint[] = [
        {
          module: {} as any,
          controllerClass: class {},
          controller: {} as any,
          handler: {} as any,
          config: {} as any,
          openApiMetadata: { tags: ['users', 'api'], excluded: false } as any,
        },
        {
          module: {} as any,
          controllerClass: class {},
          controller: {} as any,
          handler: {} as any,
          config: {} as any,
          openApiMetadata: { tags: ['orders'], excluded: false } as any,
        },
      ]

      mockScanner.scan.mockReturnValue(mockEndpoints)

      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        tags: [{ name: 'users', description: 'User operations' }],
      }

      const document = generator.generate(modules, options)

      expect(document.tags).toBeDefined()
      expect(document.tags).toContainEqual({
        name: 'users',
        description: 'User operations',
      })
      expect(document.tags).toContainEqual({ name: 'api' })
      expect(document.tags).toContainEqual({ name: 'orders' })
    })

    it('should not include tags when none discovered and none configured', async () => {
      mockScanner.scan.mockReturnValue([])

      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
      }

      const document = generator.generate(modules, options)

      expect(document.tags).toBeUndefined()
    })

    it('should log generation info', async () => {
      mockScanner.scan.mockReturnValue([])

      const generator = await container.get(OpenApiGeneratorService)

      const modules = new Map<string, ModuleMetadata>()
      const options: OpenApiGeneratorOptions = {
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
      }

      generator.generate(modules, options)

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Generating OpenAPI document',
      )
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Generated OpenAPI document'),
      )
    })
  })
})
