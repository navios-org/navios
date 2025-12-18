import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { OnServiceDestroy } from '../index.mjs'

import { Container } from '../container.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { getInjectableToken } from '../index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { asyncInject, inject } from '../injector.mjs'
import { globalRegistry, Registry } from '../registry.mjs'
import { ServiceLocator } from '../service-locator.mjs'

describe('ServiceLocator', () => {
  describe('getInstanceIdentifier', () => {
    it('should be possible to simple token', () => {
      const serviceLocator = new ServiceLocator()
      const token = InjectionToken.create('test')
      const identifier = serviceLocator.getInstanceIdentifier(token)
      expect(identifier).toBe(`test(${token.id})`)
    })

    it('should be possible to bound token', () => {
      const serviceLocator = new ServiceLocator()
      const token = InjectionToken.create('test')
      const identifier = serviceLocator.getInstanceIdentifier(
        InjectionToken.bound(token, {
          test: 'test',
        }),
      )
      expect(identifier).toBe(`test(${token.id}):test=test`)
    })

    it('should be possible to bound token with function', () => {
      const serviceLocator = new ServiceLocator()
      const token = InjectionToken.create('test')
      const identifier = serviceLocator.getInstanceIdentifier(
        InjectionToken.bound(token, { test: () => 'test' }),
      )
      expect(identifier).toBe(`test(${token.id}):test=fn_test(0)`)
    })
  })

  describe('clearAll', () => {
    let container: Container
    let mockLogger: Console

    beforeEach(() => {
      mockLogger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
      } as any

      container = new Container(globalRegistry, mockLogger)
    })

    it('should clear all services gracefully', async () => {
      const serviceLocator = container.getServiceLocator()

      // Create Injectable services
      @Injectable({ scope: InjectableScope.Singleton })
      class ServiceA {
        name = 'ServiceA'
      }

      @Injectable({ scope: InjectableScope.Singleton })
      class ServiceB {
        name = 'ServiceB'
      }

      @Injectable({ scope: InjectableScope.Singleton })
      class ServiceC {
        name = 'ServiceC'
      }

      // Create instances using container
      await container.get(ServiceA)
      await container.get(ServiceB)
      await container.get(ServiceC)

      // Verify services exist (container also registers itself as +1)
      expect(serviceLocator.getManager().size()).toBe(4)

      // Clear all services
      await serviceLocator.clearAll()

      // Verify all services are cleared
      expect(serviceLocator.getManager().size()).toBe(0)
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[ServiceInvalidator] Graceful clearing completed',
      )
    })

    it('should handle empty service locator', async () => {
      const serviceLocator = new ServiceLocator(globalRegistry, mockLogger)
      await serviceLocator.clearAll()

      expect(mockLogger.log).toHaveBeenCalledWith(
        '[ServiceInvalidator] No singleton services to clear',
      )
    })

    it('should clear service from a request context', async () => {
      const serviceLocator = container.getServiceLocator()

      @Injectable({ scope: InjectableScope.Singleton })
      class ServiceA {
        name = 'ServiceA'
      }

      @Injectable({ scope: InjectableScope.Request })
      class ServiceB {
        serviceA = inject(ServiceA)
        name = 'ServiceB'
      }

      const requestId = 'test-request'
      const scoped = container.beginRequest(requestId)
      const serviceB = await scoped.get(ServiceB)
      expect(serviceB).toBeDefined()

      await scoped.invalidate(await container.get(ServiceA))
      // Container itself remains
      expect(serviceLocator.getManager().size()).toBe(1)
      await serviceLocator.clearAll()
      await scoped.endRequest()
    })

    it('should clear request contexts via ScopedContainer', async () => {
      // Create a request context
      const requestId = 'test-request'
      const scoped = container.beginRequest(requestId)

      // Create Injectable service with request scope
      @Injectable({ scope: InjectableScope.Request })
      class TestService {
        name = 'TestService'
      }

      await scoped.get(TestService)

      // Verify request context exists
      expect(container.hasActiveRequest(requestId)).toBe(true)

      // End request to clean up
      await scoped.endRequest()

      // Verify request context is cleared
      expect(container.hasActiveRequest(requestId)).toBe(false)
    })

    it('should track active request contexts', async () => {
      // Create a request context
      const requestId = 'test-request'
      const scoped = container.beginRequest(requestId)

      // Verify request context exists
      expect(container.hasActiveRequest(requestId)).toBe(true)

      // End request
      await scoped.endRequest()

      // Verify request context is gone
      expect(container.hasActiveRequest(requestId)).toBe(false)
    })

    it('should handle services with dependencies correctly', async () => {
      const serviceLocator = container.getServiceLocator()

      // Create Injectable services
      @Injectable({ scope: InjectableScope.Singleton })
      class ServiceA {
        name = 'ServiceA'
      }

      @Injectable({ scope: InjectableScope.Singleton })
      class ServiceB {
        serviceA = inject(ServiceA)
        name = 'ServiceB'
      }

      // Create instances using container
      await container.get(ServiceB)

      // Clear all services
      await serviceLocator.clearAll()

      // Verify all services are cleared
      expect(serviceLocator.getManager().size()).toBe(0)
    })

    it('should respect maxRounds option', async () => {
      const serviceLocator = container.getServiceLocator()

      // Create Injectable service
      @Injectable({ scope: InjectableScope.Singleton })
      class TestService {
        name = 'TestService'
      }

      await container.get(TestService)

      // Clear with a very low maxRounds to test the limit
      await serviceLocator.clearAll({ maxRounds: 1 })

      // Should still clear the service
      expect(serviceLocator.getManager().size()).toBe(0)
    })

    it('should clear services with dependencies in correct order', async () => {
      const serviceLocator = container.getServiceLocator()

      // Create services with dependencies
      @Injectable({ scope: InjectableScope.Singleton })
      class DatabaseService {
        name = 'DatabaseService'
      }

      @Injectable({ scope: InjectableScope.Singleton })
      class UserService {
        public database = inject(DatabaseService)
        name = 'UserService'
      }

      @Injectable({ scope: InjectableScope.Singleton })
      class AuthService {
        public userService = inject(UserService)
        name = 'AuthService'
      }

      // Create instances (this will establish dependencies)
      await container.get(AuthService)
      await container.get(UserService)
      await container.get(DatabaseService)

      // Verify services exist (container also registers itself as +1)
      expect(serviceLocator.getManager().size()).toBe(4)

      // Clear all services - should clear in dependency order
      await serviceLocator.clearAll()

      // Verify all services are cleared
      expect(serviceLocator.getManager().size()).toBe(0)
    })

    it('should handle services with destroy listeners', async () => {
      const serviceLocator = container.getServiceLocator()

      let destroyCalled = false
      @Injectable({ scope: InjectableScope.Singleton })
      class TestService implements OnServiceDestroy {
        name = 'TestService'

        constructor() {
          // Simulate a service that needs cleanup
        }

        async onServiceDestroy() {
          destroyCalled = true
        }
      }

      await container.get(TestService)

      // Clear all services
      await serviceLocator.clearAll()

      // Verify all services are cleared
      expect(serviceLocator.getManager().size()).toBe(0)
      expect(destroyCalled).toBe(true)
    })
  })

  describe('Mixed Scope Services', () => {
    let container: Container
    let mockLogger: Console

    beforeEach(() => {
      mockLogger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
      } as any

      container = new Container(globalRegistry, mockLogger)
    })

    describe('Services with dependencies across different scopes', () => {
      it('should handle Singleton service depending on Transient service', async () => {
        // Create Transient service
        @Injectable({ scope: InjectableScope.Transient })
        class TransientService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'TransientService'
        }

        // Create Singleton service that depends on Transient service
        @Injectable({ scope: InjectableScope.Singleton })
        class SingletonService {
          transientService = asyncInject(TransientService)
          name = 'SingletonService'
        }

        // Get instances
        const singleton1 = await container.get(SingletonService)
        const singleton2 = await container.get(SingletonService)

        expect(singleton1).toBe(singleton2) // Same singleton instance

        // Get the actual transient service instances (asyncInject returns Promises)
        const transient1 = await singleton1.transientService
        const transient2 = await singleton2.transientService

        // Note: Since Singleton is created once, both references point to the same Transient instance
        // This is expected behavior - the Transient service is created once during Singleton instantiation
        expect(transient1).toBe(transient2) // Same transient instance (created during singleton instantiation)
      })

      it('should handle Request service depending on Singleton service', async () => {
        // Create Singleton service
        @Injectable({ scope: InjectableScope.Singleton })
        class SingletonService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'SingletonService'
        }

        // Create Request service that depends on Singleton service
        @Injectable({ scope: InjectableScope.Request })
        class RequestService {
          singletonService = inject(SingletonService)
          name = 'RequestService'
        }

        // Begin request context
        const scoped1 = container.beginRequest('test-request-1')

        // Get instances within the same request
        const request1 = await scoped1.get(RequestService)
        const request2 = await scoped1.get(RequestService)

        expect(request1).toBe(request2) // Same request-scoped instance
        expect(request1.singletonService).toBe(request2.singletonService) // Same singleton instance

        // End request and start new one
        await scoped1.endRequest()
        const scoped2 = container.beginRequest('test-request-2')

        // Get instance in new request
        const request3 = await scoped2.get(RequestService)

        expect(request1).not.toBe(request3) // Different request-scoped instances
        expect(request1.singletonService).toBe(request3.singletonService) // Same singleton instance

        await scoped2.endRequest()
      })

      it('should handle Transient service depending on Request service', async () => {
        // Create Request service
        @Injectable({ scope: InjectableScope.Request })
        class RequestService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'RequestService'
        }

        // Create Transient service that depends on Request service
        @Injectable({ scope: InjectableScope.Transient })
        class TransientService {
          requestService = inject(RequestService)
          name = 'TransientService'
        }

        // Begin request context
        const scoped = container.beginRequest('test-request')

        // Get multiple transient instances
        const transient1 = await scoped.get(TransientService)
        const transient2 = await scoped.get(TransientService)

        expect(transient1).not.toBe(transient2) // Different transient instances

        // Get the actual request service instances
        const requestService1 = transient1.requestService
        const requestService2 = transient2.requestService
        expect(requestService1).toBe(requestService2) // Same request-scoped instance

        await scoped.endRequest()
      })

      it('should handle complex dependency chain across all scopes', async () => {
        // Create services with different scopes
        @Injectable({ scope: InjectableScope.Singleton })
        class DatabaseService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'DatabaseService'
        }

        @Injectable({ scope: InjectableScope.Request })
        class UserSessionService {
          database = inject(DatabaseService)
          id = Math.random().toString(36).substr(2, 9)
          name = 'UserSessionService'
        }

        @Injectable({ scope: InjectableScope.Transient })
        class UserActionService {
          session = inject(UserSessionService)
          database = inject(DatabaseService)
          id = Math.random().toString(36).substr(2, 9)
          name = 'UserActionService'
        }

        @Injectable({ scope: InjectableScope.Singleton })
        class UserManagerService {
          database = inject(DatabaseService)
          name = 'UserManagerService'
        }

        // Begin request context
        const scoped = container.beginRequest('complex-request')

        // Get instances
        const action1 = await scoped.get(UserActionService)
        const action2 = await scoped.get(UserActionService)
        const manager = await container.get(UserManagerService)

        // Verify instances are created
        expect(action1).toBeDefined()
        expect(action2).toBeDefined()
        expect(manager).toBeDefined()

        // Verify scope behavior - check if dependencies are properly injected
        expect(action1).not.toBe(action2) // Different transient instances

        // Get the actual dependency instances
        const action1Database = action1.database
        const action2Database = action2.database
        const action1Session = action1.session
        const action2Session = action2.session

        expect(action1Database).toBe(action2Database) // Same singleton instance
        expect(action1Database).toBe(manager.database) // Same singleton instance

        // Check if session dependency is properly injected
        expect(action1Session).toBe(action2Session) // Same request-scoped instance
        expect(action1Session.database).toBe(action1Database) // Same singleton instance

        // End request and start new one
        await scoped.endRequest()
        const scoped2 = container.beginRequest('complex-request-2')

        // Get instances in new request
        const action3 = await scoped2.get(UserActionService)
        const manager2 = await container.get(UserManagerService)

        // Verify scope behavior across requests
        expect(action1).not.toBe(action3) // Different transient instances

        // Get the actual dependency instances for the new request
        const action3Database = action3.database
        const action3Session = action3.session

        expect(action1Database).toBe(action3Database) // Same singleton instance
        expect(manager).toBe(manager2) // Same singleton instance

        // Check if session dependency is properly injected in new request
        expect(action1Session).not.toBe(action3Session) // Different request-scoped instances

        await scoped2.endRequest()
      })
    })

    describe('Instance sharing and isolation', () => {
      it('should isolate Request-scoped instances between different requests', async () => {
        @Injectable({ scope: InjectableScope.Request })
        class RequestService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'RequestService'
        }

        // First request
        const scoped1 = container.beginRequest('request-1')
        const service1 = await scoped1.get(RequestService)
        await scoped1.endRequest()

        // Second request
        const scoped2 = container.beginRequest('request-2')
        const service2 = await scoped2.get(RequestService)
        await scoped2.endRequest()

        expect(service1).not.toBe(service2) // Different instances
        expect(service1.id).not.toBe(service2.id) // Different IDs
      })

      it('should share Singleton instances across requests', async () => {
        @Injectable({ scope: InjectableScope.Singleton })
        class SingletonService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'SingletonService'
        }

        // First request
        const scoped1 = container.beginRequest('request-1')
        const service1 = await scoped1.get(SingletonService)
        await scoped1.endRequest()

        // Second request
        const scoped2 = container.beginRequest('request-2')
        const service2 = await scoped2.get(SingletonService)
        await scoped2.endRequest()

        expect(service1).toBe(service2) // Same instance
        expect(service1.id).toBe(service2.id) // Same ID
      })

      it('should create new Transient instances every time', async () => {
        @Injectable({ scope: InjectableScope.Transient })
        class TransientService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'TransientService'
        }

        const service1 = await container.get(TransientService)
        const service2 = await container.get(TransientService)
        const service3 = await container.get(TransientService)

        expect(service1).not.toBe(service2) // Different instances
        expect(service1).not.toBe(service3) // Different instances
        expect(service2).not.toBe(service3) // Different instances
        expect(service1.id).not.toBe(service2.id) // Different IDs
        expect(service1.id).not.toBe(service3.id) // Different IDs
        expect(service2.id).not.toBe(service3.id) // Different IDs
      })
    })

    describe('Request context management with mixed scopes', () => {
      it('should properly clean up Request-scoped instances when ending request', async () => {
        @Injectable({ scope: InjectableScope.Request })
        class RequestService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'RequestService'
        }

        @Injectable({ scope: InjectableScope.Singleton })
        class SingletonService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'SingletonService'
        }

        const scoped = container.beginRequest('cleanup-test')

        // Create instances
        const _requestService = await scoped.get(RequestService)
        const singletonService = await scoped.get(SingletonService)

        // Verify request context exists
        expect(container.hasActiveRequest('cleanup-test')).toBe(true)

        // End request
        await scoped.endRequest()

        // Verify request context is cleared
        expect(container.hasActiveRequest('cleanup-test')).toBe(false)

        // Singleton should still be available
        const singletonService2 = await container.get(SingletonService)
        expect(singletonService).toBe(singletonService2) // Same singleton instance

        // Request service should not be available (no current request context)
        await expect(container.get(RequestService)).rejects.toThrow(
          /Cannot resolve request-scoped service/,
        )
      })

      it('should handle parallel request contexts with mixed scopes', async () => {
        @Injectable({ scope: InjectableScope.Request })
        class RequestService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'RequestService'
        }

        @Injectable({ scope: InjectableScope.Singleton })
        class SingletonService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'SingletonService'
        }

        // First request
        const scoped1 = container.beginRequest('outer-request')
        const requestService1 = await scoped1.get(RequestService)
        const singletonService1 = await scoped1.get(SingletonService)

        // Second request (parallel)
        const scoped2 = container.beginRequest('inner-request')
        const requestService2 = await scoped2.get(RequestService)
        const singletonService2 = await scoped2.get(SingletonService)

        // Verify instances
        expect(requestService1).not.toBe(requestService2) // Different request instances
        expect(singletonService1).toBe(singletonService2) // Same singleton instance

        // End both requests
        await scoped2.endRequest()
        await scoped1.endRequest()

        // Verify no active contexts
        expect(container.hasActiveRequest('outer-request')).toBe(false)
        expect(container.hasActiveRequest('inner-request')).toBe(false)
      })

      it('should handle concurrent requests with mixed scopes', async () => {
        @Injectable({ scope: InjectableScope.Request })
        class RequestService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'RequestService'
        }

        @Injectable({ scope: InjectableScope.Singleton })
        class SingletonService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'SingletonService'
        }

        // Start multiple requests sequentially
        const requestIds = ['req-1', 'req-2', 'req-3']
        const results = []

        for (const requestId of requestIds) {
          const scoped = container.beginRequest(requestId)
          const requestService = await scoped.get(RequestService)
          const singletonService = await scoped.get(SingletonService)
          await scoped.endRequest()
          results.push({ requestService, singletonService, requestId })
        }

        // Verify all requests completed successfully
        results.forEach(({ requestService, singletonService }) => {
          expect(requestService).toBeDefined()
          expect(singletonService).toBeDefined()
        })

        // Verify request services are different
        expect(results[0].requestService).not.toBe(results[1].requestService)
        expect(results[0].requestService).not.toBe(results[2].requestService)
        expect(results[1].requestService).not.toBe(results[2].requestService)

        // Verify singleton services are the same
        expect(results[0].singletonService).toBe(results[1].singletonService)
        expect(results[0].singletonService).toBe(results[2].singletonService)
        expect(results[1].singletonService).toBe(results[2].singletonService)
      })
    })

    describe('Error handling with mixed scopes', () => {
      it('should handle Request-scoped service without request context', async () => {
        @Injectable({ scope: InjectableScope.Request })
        class RequestService {
          name = 'RequestService'
        }

        // Try to get Request-scoped service without request context
        await expect(container.get(RequestService)).rejects.toThrow(
          /Cannot resolve request-scoped service/,
        )
      })

      it('should handle service instantiation errors in mixed scope scenario', async () => {
        @Injectable({ scope: InjectableScope.Singleton })
        class SingletonService {
          constructor() {
            throw new Error('Singleton creation failed')
          }
          name = 'SingletonService'
        }

        @Injectable({ scope: InjectableScope.Request })
        class RequestService {
          singleton = inject(SingletonService)
          name = 'RequestService'
        }

        const scoped = container.beginRequest('error-test')

        // Try to get Request service that depends on failing Singleton
        await expect(scoped.get(RequestService)).rejects.toThrow(
          'Singleton creation failed',
        )

        await scoped.endRequest()
      })
    })
  })

  describe('Injectable with Schema', () => {
    let container: Container

    beforeEach(() => {
      container = new Container(globalRegistry)
    })

    it('should work with simple schema definition', async () => {
      const configSchema = z.object({
        host: z.string(),
        port: z.number(),
      })

      @Injectable({ schema: configSchema })
      class DatabaseConfig {
        constructor(public readonly config: z.output<typeof configSchema>) {}

        getConnectionString() {
          return `${this.config.host}:${this.config.port}`
        }
      }

      const token = getInjectableToken(DatabaseConfig)
      const instance = await container.get(
        InjectionToken.bound(token, {
          host: 'localhost',
          port: 5432,
        }),
      )

      expect(instance).toBeInstanceOf(DatabaseConfig)
      expect(instance.config).toEqual({ host: 'localhost', port: 5432 })
      expect(instance.getConnectionString()).toBe('localhost:5432')
    })

    it('should work with schema and singleton scope', async () => {
      const apiSchema = z.object({
        apiKey: z.string(),
        baseUrl: z.string(),
      })

      @Injectable({ schema: apiSchema, scope: InjectableScope.Singleton })
      class ApiClient {
        constructor(public readonly config: z.output<typeof apiSchema>) {}

        getApiKey() {
          return this.config.apiKey
        }
      }

      const instance1 = await container.get(ApiClient, {
        apiKey: 'secret-key',
        baseUrl: 'https://api.example.com',
      })
      const instance2 = await container.get(ApiClient, {
        apiKey: 'secret-key',
        baseUrl: 'https://api.example.com',
      })

      expect(instance1).toBe(instance2) // Same singleton instance
      expect(instance1.getApiKey()).toBe('secret-key')
    })

    it('should work with schema and transient scope', async () => {
      const loggerSchema = z.object({
        level: z.enum(['debug', 'info', 'warn', 'error']),
        prefix: z.string(),
      })

      @Injectable({ schema: loggerSchema, scope: InjectableScope.Transient })
      class Logger {
        constructor(public readonly config: z.output<typeof loggerSchema>) {}

        log(message: string) {
          return `[${this.config.prefix}] ${message}`
        }
      }

      const instance1 = await container.get(Logger, {
        level: 'info' as const,
        prefix: 'APP',
      })
      const instance2 = await container.get(Logger, {
        level: 'info' as const,
        prefix: 'APP',
      })

      expect(instance1).not.toBe(instance2) // Different transient instances
      expect(instance1.log('test')).toBe('[APP] test')
      expect(instance2.log('test')).toBe('[APP] test')
    })

    it('should work with schema and dependency injection', async () => {
      const dbConfigSchema = z.object({
        connectionString: z.string(),
      })

      @Injectable({ schema: dbConfigSchema })
      class DatabaseConfig {
        constructor(public readonly config: z.output<typeof dbConfigSchema>) {}
      }

      @Injectable()
      class DatabaseService {
        private dbConfig = inject(DatabaseConfig, {
          connectionString: 'postgres://localhost:5432/mydb',
        })

        getConnectionString() {
          return this.dbConfig.config.connectionString
        }
      }

      const instance = await container.get(DatabaseService)

      expect(instance).toBeInstanceOf(DatabaseService)
      expect(instance.getConnectionString()).toBe(
        'postgres://localhost:5432/mydb',
      )
    })

    it('should work with schema and async dependency injection', async () => {
      const cacheConfigSchema = z.object({
        ttl: z.number(),
        maxSize: z.number(),
      })

      @Injectable({ schema: cacheConfigSchema })
      class CacheConfig {
        constructor(
          public readonly config: z.output<typeof cacheConfigSchema>,
        ) {}
      }

      @Injectable()
      class CacheService {
        private cacheConfig = asyncInject(CacheConfig, {
          ttl: 3600,
          maxSize: 1000,
        })

        async getConfig() {
          const config = await this.cacheConfig
          return config.config
        }
      }

      const instance = await container.get(CacheService)

      expect(instance).toBeInstanceOf(CacheService)
      const config = await instance.getConfig()
      expect(config).toEqual({ ttl: 3600, maxSize: 1000 })
    })

    it('should validate schema when using bound tokens', async () => {
      const strictSchema = z.object({
        required: z.string(),
        optional: z.number().optional(),
      })

      @Injectable({ schema: strictSchema })
      class StrictService {
        constructor(public readonly config: z.output<typeof strictSchema>) {}
      }

      // Valid configuration
      const instance1 = await container.get(StrictService, {
        required: 'value',
        optional: 42,
      })

      expect(instance1).toBeInstanceOf(StrictService)
      expect(instance1.config).toEqual({ required: 'value', optional: 42 })

      // Valid with optional field missing
      const instance2 = await container.get(StrictService, {
        required: 'another value',
      })

      expect(instance2).toBeInstanceOf(StrictService)
      expect(instance2.config).toEqual({ required: 'another value' })
    })

    it('should work with complex nested schemas', async () => {
      const nestedSchema = z.object({
        database: z.object({
          host: z.string(),
          port: z.number(),
          credentials: z.object({
            username: z.string(),
            password: z.string(),
          }),
        }),
        cache: z.object({
          enabled: z.boolean(),
          ttl: z.number(),
        }),
      })

      @Injectable({ schema: nestedSchema })
      class AppConfig {
        constructor(public readonly config: z.output<typeof nestedSchema>) {}

        getDatabaseHost() {
          return this.config.database.host
        }

        isCacheEnabled() {
          return this.config.cache.enabled
        }
      }

      const instance = await container.get(AppConfig, {
        database: {
          host: 'db.example.com',
          port: 5432,
          credentials: {
            username: 'admin',
            password: 'secret',
          },
        },
        cache: {
          enabled: true,
          ttl: 300,
        },
      })

      expect(instance).toBeInstanceOf(AppConfig)
      expect(instance.getDatabaseHost()).toBe('db.example.com')
      expect(instance.isCacheEnabled()).toBe(true)
    })

    it('should work with schema in request-scoped services', async () => {
      const userContextSchema = z.object({
        userId: z.string(),
        sessionId: z.string(),
      })

      @Injectable({
        schema: userContextSchema,
        scope: InjectableScope.Request,
      })
      class UserContext {
        constructor(
          public readonly context: z.output<typeof userContextSchema>,
        ) {}

        getUserId() {
          return this.context.userId
        }
      }

      const scoped = container.beginRequest('test-request')

      const instance = await scoped.get(UserContext, {
        userId: 'user-123',
        sessionId: 'session-456',
      })

      expect(instance).toBeInstanceOf(UserContext)
      expect(instance.getUserId()).toBe('user-123')

      await scoped.endRequest()
    })
  })
})
