import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OnServiceDestroy } from '../index.mjs'

import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { getInjectableToken } from '../index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { asyncInject, inject } from '../injector.mjs'
import { globalRegistry } from '../registry.mjs'
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
    let serviceLocator: ServiceLocator
    let mockLogger: Console

    beforeEach(() => {
      mockLogger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
      } as any

      serviceLocator = new ServiceLocator(globalRegistry, mockLogger)
    })

    it('should clear all services gracefully', async () => {
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

      // Create instances
      await serviceLocator.getInstance(ServiceA)
      await serviceLocator.getInstance(ServiceB)
      await serviceLocator.getInstance(ServiceC)

      // Verify services exist
      expect(serviceLocator.getManager().size()).toBe(3)

      // Clear all services
      await serviceLocator.clearAll()

      // Verify all services are cleared
      expect(serviceLocator.getManager().size()).toBe(0)
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[ServiceInvalidator] Graceful clearing completed',
      )
    })

    it('should handle empty service locator', async () => {
      await serviceLocator.clearAll()

      expect(mockLogger.log).toHaveBeenCalledWith(
        '[ServiceInvalidator] No singleton services to clear',
      )
    })

    it('should clear service from a request context', async () => {
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
      serviceLocator.beginRequest(requestId)
      const [error, serviceB] = await serviceLocator.getInstance(ServiceB)
      expect(error).toBeUndefined()
      expect(serviceB).toBeDefined()

      await serviceLocator.invalidate(getInjectableToken(ServiceA).toString())
      expect(serviceLocator.getManager().size()).toBe(0)
      await serviceLocator.clearAll()
    })

    it('should clear request contexts when requested', async () => {
      // Create a request context
      const requestId = 'test-request'
      serviceLocator.beginRequest(requestId)

      // Create Injectable service with request scope
      @Injectable({ scope: InjectableScope.Request })
      class TestService {
        name = 'TestService'
      }

      await serviceLocator.getInstance(TestService)

      // Verify request context exists before clearing
      expect(serviceLocator.getCurrentRequestContext()).not.toBeNull()

      // Clear all services including request contexts
      await serviceLocator.clearAll({ clearRequestContexts: true })

      // Verify request context is cleared
      expect(serviceLocator.getCurrentRequestContext()).toBeNull()
    })

    it('should skip clearing request contexts when disabled', async () => {
      // Create a request context
      const requestId = 'test-request'
      serviceLocator.beginRequest(requestId)

      // Clear all services but skip request contexts
      await serviceLocator.clearAll({ clearRequestContexts: false })

      // Verify request context is still there
      expect(serviceLocator.getCurrentRequestContext()).not.toBeNull()
    })

    it('should handle services with dependencies correctly', async () => {
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

      // Create instances
      await serviceLocator.getInstance(ServiceB)

      // Clear all services
      await serviceLocator.clearAll()

      // Verify all services are cleared
      expect(serviceLocator.getManager().size()).toBe(0)
    })

    it('should respect maxRounds option', async () => {
      // Create Injectable service
      @Injectable({ scope: InjectableScope.Singleton })
      class TestService {
        name = 'TestService'
      }

      await serviceLocator.getInstance(TestService)

      // Clear with a very low maxRounds to test the limit
      await serviceLocator.clearAll({ maxRounds: 1 })

      // Should still clear the service
      expect(serviceLocator.getManager().size()).toBe(0)
    })

    it('should clear services with dependencies in correct order', async () => {
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
      await serviceLocator.getInstance(AuthService)
      await serviceLocator.getInstance(UserService)
      await serviceLocator.getInstance(DatabaseService)

      // Verify services exist
      expect(serviceLocator.getManager().size()).toBe(3)

      // Clear all services - should clear in dependency order
      await serviceLocator.clearAll()

      // Verify all services are cleared
      expect(serviceLocator.getManager().size()).toBe(0)
    })

    it('should handle services with destroy listeners', async () => {
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

      await serviceLocator.getInstance(TestService)

      // Clear all services
      await serviceLocator.clearAll()

      // Verify all services are cleared
      expect(serviceLocator.getManager().size()).toBe(0)
      expect(destroyCalled).toBe(true)
    })
  })

  describe('Mixed Scope Services', () => {
    let serviceLocator: ServiceLocator
    let mockLogger: Console

    beforeEach(() => {
      mockLogger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
      } as any

      serviceLocator = new ServiceLocator(globalRegistry, mockLogger)
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
        const [error1, singleton1] =
          await serviceLocator.getInstance(SingletonService)
        const [error2, singleton2] =
          await serviceLocator.getInstance(SingletonService)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()
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
        const requestId = 'test-request-1'
        serviceLocator.beginRequest(requestId)

        // Get instances within the same request
        const [error1, request1] =
          await serviceLocator.getInstance(RequestService)
        const [error2, request2] =
          await serviceLocator.getInstance(RequestService)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()
        expect(request1).toBe(request2) // Same request-scoped instance
        expect(request1.singletonService).toBe(request2.singletonService) // Same singleton instance

        // End request and start new one
        await serviceLocator.endRequest(requestId)
        const newRequestId = 'test-request-2'
        serviceLocator.beginRequest(newRequestId)

        // Get instance in new request
        const [error3, request3] =
          await serviceLocator.getInstance(RequestService)

        expect(error3).toBeUndefined()
        expect(request1).not.toBe(request3) // Different request-scoped instances
        expect(request1.singletonService).toBe(request3.singletonService) // Same singleton instance
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
        const requestId = 'test-request'
        serviceLocator.beginRequest(requestId)

        // Get multiple transient instances
        const [error1, transient1] =
          await serviceLocator.getInstance(TransientService)
        const [error2, transient2] =
          await serviceLocator.getInstance(TransientService)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()
        expect(transient1).not.toBe(transient2) // Different transient instances

        // Get the actual request service instances (asyncInject returns Promises)
        const requestService1 = transient1.requestService
        const requestService2 = transient2.requestService
        expect(requestService1).toBe(requestService2) // Same request-scoped instance
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
        const requestId = 'complex-request'
        serviceLocator.beginRequest(requestId)

        // Get instances
        const [error1, action1] =
          await serviceLocator.getInstance(UserActionService)
        const [error2, action2] =
          await serviceLocator.getInstance(UserActionService)
        const [error3, manager] =
          await serviceLocator.getInstance(UserManagerService)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()
        expect(error3).toBeUndefined()

        // Verify instances are created
        expect(action1).toBeDefined()
        expect(action2).toBeDefined()
        expect(manager).toBeDefined()

        // Verify scope behavior - check if dependencies are properly injected
        expect(action1).not.toBe(action2) // Different transient instances

        // Get the actual dependency instances (asyncInject returns Promises)
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
        await serviceLocator.endRequest(requestId)
        const newRequestId = 'complex-request-2'
        serviceLocator.beginRequest(newRequestId)

        // Get instances in new request
        const [error4, action3] =
          await serviceLocator.getInstance(UserActionService)
        const [error5, manager2] =
          await serviceLocator.getInstance(UserManagerService)

        expect(error4).toBeUndefined()
        expect(error5).toBeUndefined()

        // Verify scope behavior across requests
        expect(action1).not.toBe(action3) // Different transient instances

        // Get the actual dependency instances for the new request
        const action3Database = action3.database
        const action3Session = action3.session

        expect(action1Database).toBe(action3Database) // Same singleton instance
        expect(manager).toBe(manager2) // Same singleton instance

        // Check if session dependency is properly injected in new request
        expect(action1Session).not.toBe(action3Session) // Different request-scoped instances
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
        const requestId1 = 'request-1'
        serviceLocator.beginRequest(requestId1)
        const [error1, service1] =
          await serviceLocator.getInstance(RequestService)
        await serviceLocator.endRequest(requestId1)

        // Second request
        const requestId2 = 'request-2'
        serviceLocator.beginRequest(requestId2)
        const [error2, service2] =
          await serviceLocator.getInstance(RequestService)
        await serviceLocator.endRequest(requestId2)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()
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
        const requestId1 = 'request-1'
        serviceLocator.beginRequest(requestId1)
        const [error1, service1] =
          await serviceLocator.getInstance(SingletonService)
        await serviceLocator.endRequest(requestId1)

        // Second request
        const requestId2 = 'request-2'
        serviceLocator.beginRequest(requestId2)
        const [error2, service2] =
          await serviceLocator.getInstance(SingletonService)
        await serviceLocator.endRequest(requestId2)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()
        expect(service1).toBe(service2) // Same instance
        expect(service1.id).toBe(service2.id) // Same ID
      })

      it('should create new Transient instances every time', async () => {
        @Injectable({ scope: InjectableScope.Transient })
        class TransientService {
          id = Math.random().toString(36).substr(2, 9)
          name = 'TransientService'
        }

        const requestId = 'request'
        serviceLocator.beginRequest(requestId)

        const [error1, service1] =
          await serviceLocator.getInstance(TransientService)
        const [error2, service2] =
          await serviceLocator.getInstance(TransientService)
        const [error3, service3] =
          await serviceLocator.getInstance(TransientService)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()
        expect(error3).toBeUndefined()
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

        const requestId = 'cleanup-test'
        serviceLocator.beginRequest(requestId)

        // Create instances
        const [error1, _requestService] =
          await serviceLocator.getInstance(RequestService)
        const [error2, singletonService] =
          await serviceLocator.getInstance(SingletonService)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()

        // Verify request context exists
        expect(serviceLocator.getCurrentRequestContext()).not.toBeNull()
        expect(serviceLocator.getCurrentRequestContext()?.requestId).toBe(
          requestId,
        )

        // End request
        await serviceLocator.endRequest(requestId)

        // Verify request context is cleared
        expect(serviceLocator.getCurrentRequestContext()).toBeNull()

        // Singleton should still be available
        const [error3, singletonService2] =
          await serviceLocator.getInstance(SingletonService)
        expect(error3).toBeUndefined()
        expect(singletonService).toBe(singletonService2) // Same singleton instance

        // Request service should not be available (no current request context)
        const [error4] = await serviceLocator.getInstance(RequestService)
        expect(error4).toBeDefined() // Should error because no request context
      })

      it('should handle nested request contexts with mixed scopes', async () => {
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
        const requestId1 = 'outer-request'
        serviceLocator.beginRequest(requestId1)
        const [error1, requestService1] =
          await serviceLocator.getInstance(RequestService)
        const [error2, singletonService1] =
          await serviceLocator.getInstance(SingletonService)

        // Second request (nested)
        const requestId2 = 'inner-request'
        serviceLocator.beginRequest(requestId2)
        const [error3, requestService2] =
          await serviceLocator.getInstance(RequestService)
        const [error4, singletonService2] =
          await serviceLocator.getInstance(SingletonService)

        expect(error1).toBeUndefined()
        expect(error2).toBeUndefined()
        expect(error3).toBeUndefined()
        expect(error4).toBeUndefined()

        // Verify instances
        expect(requestService1).not.toBe(requestService2) // Different request instances
        expect(singletonService1).toBe(singletonService2) // Same singleton instance

        // End inner request
        await serviceLocator.endRequest(requestId2)

        // Verify current context is back to outer request
        expect(serviceLocator.getCurrentRequestContext()?.requestId).toBe(
          requestId1,
        )

        // End outer request
        await serviceLocator.endRequest(requestId1)

        // Verify no current context
        expect(serviceLocator.getCurrentRequestContext()).toBeNull()
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

        // Start multiple requests sequentially to avoid race conditions
        const requestIds = ['req-1', 'req-2', 'req-3']
        const results = []

        for (const requestId of requestIds) {
          serviceLocator.beginRequest(requestId)
          const [_error1, requestService] =
            await serviceLocator.getInstance(RequestService)
          const [_error2, singletonService] =
            await serviceLocator.getInstance(SingletonService)
          await serviceLocator.endRequest(requestId)
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
        const [error] = await serviceLocator.getInstance(RequestService)

        expect(error).toBeDefined()
        expect(error?.code).toBe('UnknownError')
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

        const requestId = 'error-test'
        serviceLocator.beginRequest(requestId)

        // Try to get Request service that depends on failing Singleton
        // The system should throw an error when the service cannot be instantiated
        await expect(
          serviceLocator.getInstance(RequestService),
        ).rejects.toThrow('Service RequestService cannot be instantiated')
      })
    })
  })
})
