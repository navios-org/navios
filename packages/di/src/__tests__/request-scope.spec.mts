import { beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../container.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { inject } from '../index.mjs'
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

      expect(holder.hasInstance('test-instance')).toBe(true)
      expect(holder.getInstance('test-instance')).toBe(mockInstance)
      expect(holder.getHolder('test-instance')).toBe(mockHolder)

      // Clear instances
      holder.clear()
      expect(holder.hasInstance('test-instance')).toBe(false)
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
  })
})
