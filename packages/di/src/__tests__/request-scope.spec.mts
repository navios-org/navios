import { beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../container.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { inject } from '../index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { Registry } from '../registry.mjs'
import { createRequestContextHolder } from '../request-context-holder.mjs'

describe('Request Scope', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  describe('Request-scoped services', () => {
    it('should create different instances for different requests', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly requestId = Math.random().toString(36)
        public readonly createdAt = new Date()
      }

      // Start first request
      container.beginRequest('request-1')
      const instance1a = await container.get(RequestService)
      const instance1b = await container.get(RequestService)

      // Start second request
      container.beginRequest('request-2')
      const instance2a = await container.get(RequestService)
      const instance2b = await container.get(RequestService)

      // Within same request, instances should be the same
      expect(instance1a).toBe(instance1b)
      expect(instance2a).toBe(instance2b)

      // Between different requests, instances should be different
      expect(instance1a).not.toBe(instance2a)
      expect(instance1a.requestId).not.toBe(instance2a.requestId)

      // Clean up
      await container.endRequest('request-1')
      await container.endRequest('request-2')
    })

    it('should handle request context lifecycle correctly', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly requestId = Math.random().toString(36)
        public destroyed = false

        async onServiceDestroy() {
          this.destroyed = true
        }
      }

      // Start request
      const requestId = 'test-request'
      container.beginRequest(requestId)

      const instance = await container.get(RequestService)
      expect(instance.destroyed).toBe(false)

      // End request should trigger cleanup
      await container.endRequest(requestId)
      expect(instance.destroyed).toBe(true)
    })

    it('should support request metadata', async () => {
      const requestId = 'test-request'
      const metadata = { userId: 'user123', sessionId: 'session456' }

      container.beginRequest(requestId, metadata)

      // Note: In a real implementation, you might want to inject metadata
      // For now, we'll just verify the context exists
      const context = container.getCurrentRequestContext()
      expect(context).not.toBeNull()
      expect(context?.requestId).toBe(requestId)
      expect(context?.getMetadata('userId')).toBe('user123')
      expect(context?.getMetadata('sessionId')).toBe('session456')

      await container.endRequest(requestId)
    })

    it('should handle pre-prepared instances', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly requestId = Math.random().toString(36)
        public readonly prePrepared = true
      }

      const requestId = 'test-request'
      container.beginRequest(requestId)

      // Getting the instance should be fast (pre-prepared)
      const instance = await container.get(RequestService)
      expect(instance.prePrepared).toBe(true)

      await container.endRequest(requestId)
    })

    it('should handle mixed scopes correctly', async () => {
      @Injectable({ registry, scope: InjectableScope.Singleton })
      class SingletonService {
        public readonly id = Math.random().toString(36)
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly id = Math.random().toString(36)
        singleton: SingletonService = inject(SingletonService)
      }

      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientService {
        requestService = inject(RequestService)
        public readonly id = Math.random().toString(36)
      }

      // Start request
      container.beginRequest('test-request')

      const requestService1 = await container.get(RequestService)
      const requestService2 = await container.get(RequestService)
      const singleton1 = await container.get(SingletonService)
      const singleton2 = await container.get(SingletonService)
      const transient1 = await container.get(TransientService)
      const transient2 = await container.get(TransientService)

      // Request-scoped: same instance within request
      expect(requestService1).toBe(requestService2)
      expect(requestService1.singleton).toBe(singleton1)

      // Singleton: same instance always
      expect(singleton1).toBe(singleton2)

      // Transient: different instances always
      expect(transient1).not.toBe(transient2)
      expect(transient1.requestService).toBe(transient2.requestService)

      await container.endRequest('test-request')
    })

    it('should handle nested request contexts', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly id = Math.random().toString(36)
      }

      // Start first request
      container.beginRequest('request-1')
      const instance1 = await container.get(RequestService)

      // Start second request (nested)
      container.beginRequest('request-2')
      const instance2 = await container.get(RequestService)

      // Should be different instances
      expect(instance1).not.toBe(instance2)

      // End second request
      await container.endRequest('request-2')

      // Get instance from first request again
      const instance1Again = await container.get(RequestService)
      expect(instance1).toBe(instance1Again)

      // End first request
      await container.endRequest('request-1')
    })

    it('should handle request context switching', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly id = Math.random().toString(36)
      }

      // Start multiple requests
      container.beginRequest('request-1')
      container.beginRequest('request-2')
      container.beginRequest('request-3')

      // Switch to request-1
      container.setCurrentRequestContext('request-1')
      const instance1 = await container.get(RequestService)

      // Switch to request-2
      container.setCurrentRequestContext('request-2')
      const instance2 = await container.get(RequestService)

      // Switch back to request-1
      container.setCurrentRequestContext('request-1')
      const instance1Again = await container.get(RequestService)

      // Should get same instance for request-1
      expect(instance1).toBe(instance1Again)
      // Should get different instance for request-2
      expect(instance1).not.toBe(instance2)

      // Clean up all requests
      await container.endRequest('request-1')
      await container.endRequest('request-2')
      await container.endRequest('request-3')
    })
  })

  describe('RequestContextHolder', () => {
    it('should manage instances correctly', () => {
      const holder = createRequestContextHolder('test-request', 100, {
        userId: 'user123',
      })

      expect(holder.requestId).toBe('test-request')
      expect(holder.priority).toBe(100)
      expect(holder.getMetadata('userId')).toBe('user123')

      // Add instance
      const mockInstance = { id: 'test-instance' }
      const mockHolder = {
        status: 'Created' as any,
        name: 'test-instance',
        instance: mockInstance,
        creationPromise: null,
        destroyPromise: null,
        type: 'Class' as any,
        scope: 'Request' as any,
        deps: new Set<string>(),
        destroyListeners: [],
        createdAt: Date.now(),
        ttl: Infinity,
      }

      holder.addInstance('test-instance', mockInstance, mockHolder)

      expect(holder.has('test-instance')).toBe(true)
      expect(holder.get('test-instance')).toBe(mockHolder)

      // Clear instances
      holder.clear()
      expect(holder.has('test-instance')).toBe(false)
    })

    it('should handle metadata correctly', () => {
      const holder = createRequestContextHolder('test-request')

      holder.setMetadata('key1', 'value1')
      holder.setMetadata('key2', 'value2')

      expect(holder.getMetadata('key1')).toBe('value1')
      expect(holder.getMetadata('key2')).toBe('value2')
      expect(holder.getMetadata('nonexistent')).toBeUndefined()

      holder.clear()
      expect(holder.getMetadata('key1')).toBeUndefined()
    })

    it('should store instances by InjectionToken', () => {
      const holder = createRequestContextHolder('test-request')
      const token = InjectionToken.create<string>('TestService')
      const instance = { id: 'test-instance', data: 'test-data' }

      // Store instance by InjectionToken
      holder.addInstance(token, instance)

      // Verify instance is stored and retrievable
      expect(holder.has(token.toString())).toBe(true)
      expect(holder.get(token.toString())?.instance).toBe(instance)

      // Verify holder is created with correct properties
      const holderInfo = holder.get(token.toString())
      expect(holderInfo).toBeDefined()
      expect(holderInfo?.instance).toBe(instance)
      expect(holderInfo?.name).toBe(token.toString())
    })

    it('should store multiple instances by different InjectionTokens', () => {
      const holder = createRequestContextHolder('test-request')

      const token1 = InjectionToken.create<string>('Service1')
      const token2 = InjectionToken.create<number>('Service2')
      const token3 = InjectionToken.create<boolean>('Service3')

      const instance1 = { id: 'instance1', type: 'string' }
      const instance2 = { id: 'instance2', type: 'number' }
      const instance3 = { id: 'instance3', type: 'boolean' }

      // Store multiple instances
      holder.addInstance(token1, instance1)
      holder.addInstance(token2, instance2)
      holder.addInstance(token3, instance3)

      // Verify all instances are stored correctly
      expect(holder.has(token1.toString())).toBe(true)
      expect(holder.has(token2.toString())).toBe(true)
      expect(holder.has(token3.toString())).toBe(true)

      expect(holder.get(token1.toString())?.instance).toBe(instance1)
      expect(holder.get(token2.toString())?.instance).toBe(instance2)
      expect(holder.get(token3.toString())?.instance).toBe(instance3)

      // Verify each has its own holder
      const holder1 = holder.get(token1.toString())
      const holder2 = holder.get(token2.toString())
      const holder3 = holder.get(token3.toString())

      expect(holder1?.instance).toBe(instance1)
      expect(holder2?.instance).toBe(instance2)
      expect(holder3?.instance).toBe(instance3)
    })

    it('should override instances stored by InjectionToken', () => {
      const holder = createRequestContextHolder('test-request')
      const token = InjectionToken.create<string>('TestService')

      const originalInstance = { id: 'original', data: 'original-data' }
      const newInstance = { id: 'new', data: 'new-data' }

      // Store original instance
      holder.addInstance(token, originalInstance)
      expect(holder.get(token.toString())?.instance).toBe(originalInstance)

      // Override with new instance
      holder.addInstance(token, newInstance)
      expect(holder.get(token.toString())?.instance).toBe(newInstance)
      expect(holder.get(token.toString())?.instance).not.toBe(originalInstance)

      // Verify holder is updated
      const holderInfo = holder.get(token.toString())
      expect(holderInfo?.instance).toBe(newInstance)
    })

    it('should handle InjectionToken with different name types', () => {
      const holder = createRequestContextHolder('test-request')

      // Test with string name
      const stringToken = InjectionToken.create<string>('StringService')
      const stringInstance = { type: 'string' }

      // Test with symbol name
      const symbolToken = InjectionToken.create<number>(Symbol('SymbolService'))
      const symbolInstance = { type: 'symbol' }

      // Test with class name
      class TestClass {}
      const classToken = InjectionToken.create(TestClass)
      const classInstance = { type: 'class' }

      holder.addInstance(stringToken, stringInstance)
      holder.addInstance(symbolToken, symbolInstance)
      holder.addInstance(classToken, classInstance)

      expect(holder.get(stringToken.toString())?.instance).toBe(stringInstance)
      expect(holder.get(symbolToken.toString())?.instance).toBe(symbolInstance)
      expect(holder.get(classToken.toString())?.instance).toBe(classInstance)
    })

    it('should clear instances stored by InjectionToken', () => {
      const holder = createRequestContextHolder('test-request')
      const token1 = InjectionToken.create<string>('Service1')
      const token2 = InjectionToken.create<number>('Service2')

      const instance1 = { id: 'instance1' }
      const instance2 = { id: 'instance2' }

      holder.addInstance(token1, instance1)
      holder.addInstance(token2, instance2)

      expect(holder.has(token1.toString())).toBe(true)
      expect(holder.has(token2.toString())).toBe(true)

      // Clear all instances
      holder.clear()

      expect(holder.has(token1.toString())).toBe(false)
      expect(holder.has(token2.toString())).toBe(false)
      expect(holder.get(token1.toString())?.instance).toBeUndefined()
      expect(holder.get(token2.toString())?.instance).toBeUndefined()
    })

    it('should handle mixed storage by InjectionToken and string name', () => {
      const holder = createRequestContextHolder('test-request')

      const token = InjectionToken.create<string>('TokenService')
      const tokenInstance = { id: 'token-instance' }

      const stringName = 'string-service'
      const stringInstance = { id: 'string-instance' }

      // Store by InjectionToken
      holder.addInstance(token, tokenInstance)

      // Store by string name (requires holder)
      const mockHolder = {
        status: 'Created' as any,
        name: stringName,
        instance: stringInstance,
        creationPromise: null,
        destroyPromise: null,
        type: 'Class' as any,
        scope: 'Singleton' as any,
        deps: new Set<string>(),
        destroyListeners: [],
        createdAt: Date.now(),
        ttl: Infinity,
      }
      holder.addInstance(stringName, stringInstance, mockHolder)

      // Verify both are stored correctly
      expect(holder.has(token.toString())).toBe(true)
      expect(holder.has(stringName)).toBe(true)

      expect(holder.get(token.toString())?.instance).toBe(tokenInstance)
      expect(holder.get(stringName)?.instance).toBe(stringInstance)

      // Verify holders
      expect(holder.get(token.toString())?.instance).toBe(tokenInstance)
      expect(holder.get(stringName)?.instance).toBe(stringInstance)
    })
  })
})
