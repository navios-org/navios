/**
 * Garbage Collection Tests: Circular Dependencies
 *
 * Tests that services with circular dependencies (resolved via @InjectLazy)
 * are properly garbage collected without memory leaks.
 *
 * Note: Direct (eager) circular dependencies throw CircularDependencyError.
 * Use @InjectLazy to handle circular dependencies correctly. Tokens are
 * declared before the classes so the decorator can reference the other side
 * of the cycle without a forward-reference error.
 *
 * Run with: NODE_OPTIONS=--expose-gc yarn nx test @navios/di
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../../container/container.mjs'
import { InjectLazy } from '../../decorators/inject-lazy.decorator.mjs'
import { Injectable } from '../../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../../enums/injectable-scope.enum.mjs'
import { Registry } from '../../token/registry.mjs'
import { Token } from '../../token/token.mjs'

import type { OnServiceDestroy } from '../../interfaces/on-service-destroy.interface.mjs'

import {
  createGCTracker,
  forceGC,
  getHeapUsed,
  isGCAvailable,
  waitForGC,
} from './gc-test-utils.mjs'

describe.skipIf(!isGCAvailable)('GC: Circular Dependencies', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container({ registry })
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Two-way circular dependencies with @InjectLazy', () => {
    it('should garbage collect mutually dependent services after disposal', async () => {
      const TokA = Token.create<ServiceA>('TwoWayA')
      const TokB = Token.create<ServiceB>('TwoWayB')

      @Injectable({ registry, token: TokA })
      class ServiceA {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'a')
        @InjectLazy(TokB) accessor serviceBPromise!: Promise<ServiceB>

        async getServiceB(): Promise<ServiceB> {
          return this.serviceBPromise
        }
      }

      @Injectable({ registry, token: TokB })
      class ServiceB {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'b')
        @InjectLazy(TokA) accessor serviceAPromise!: Promise<ServiceA>

        async getServiceA(): Promise<ServiceA> {
          return this.serviceAPromise
        }
      }

      let serviceA: ServiceA | null = await container.get(TokA)
      let serviceB: ServiceB | null = await container.get(TokB)

      // Verify circular references are established
      expect(await serviceA.getServiceB()).toBe(serviceB)
      expect(await serviceB.getServiceA()).toBe(serviceA)

      const trackerA = createGCTracker(serviceA)
      const trackerB = createGCTracker(serviceB)

      await container.dispose()

      registry = new Registry()
      container = new Container({ registry })

      // Release local references
      serviceA = null
      serviceB = null

      // Both should be collected despite circular references
      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
    })

    it('should collect circular services when invalidated', async () => {
      const TokA = Token.create<ServiceA>('InvalidA')
      const TokB = Token.create<ServiceB>('InvalidB')

      @Injectable({ registry, token: TokA })
      class ServiceA {
        public readonly id = Math.random()
        @InjectLazy(TokB) accessor _serviceBPromise!: Promise<ServiceB>
      }

      @Injectable({ registry, token: TokB })
      class ServiceB {
        public readonly id = Math.random()
        @InjectLazy(TokA) accessor _serviceAPromise!: Promise<ServiceA>
      }

      let serviceA1: ServiceA | null = await container.get(TokA)
      let serviceB1: ServiceB | null = await container.get(TokB)

      const trackerA1 = createGCTracker(serviceA1)
      const trackerB1 = createGCTracker(serviceB1)

      const id1A = serviceA1.id
      const id1B = serviceB1.id

      // Invalidate using instance, not class
      await container.invalidate(serviceA1)

      // Release local references
      serviceA1 = null
      serviceB1 = null
      forceGC()

      // Get new instances
      const serviceA2 = await container.get(TokA)
      const serviceB2 = await container.get(TokB)

      // Old instances should be different
      expect(serviceA2.id).not.toBe(id1A)
      expect(serviceB2.id).not.toBe(id1B)

      // Old instances should be collected
      expect(await waitForGC(trackerA1().ref)).toBe(true)
      expect(await waitForGC(trackerB1().ref)).toBe(true)
    })
  })

  describe('Three-way circular dependencies', () => {
    it('should garbage collect triangular dependency cycle', async () => {
      const TokA = Token.create<ServiceA>('TriA')
      const TokB = Token.create<ServiceB>('TriB')
      const TokC = Token.create<ServiceC>('TriC')

      @Injectable({ registry, token: TokA })
      class ServiceA {
        public readonly id = 'A'
        public readonly data = Array.from({ length: 300 }, () => 'a')
        @InjectLazy(TokB) accessor serviceBPromise!: Promise<ServiceB>

        async getB(): Promise<ServiceB> {
          return this.serviceBPromise
        }
      }

      @Injectable({ registry, token: TokB })
      class ServiceB {
        public readonly id = 'B'
        public readonly data = Array.from({ length: 300 }, () => 'b')
        @InjectLazy(TokC) accessor serviceCPromise!: Promise<ServiceC>

        async getC(): Promise<ServiceC> {
          return this.serviceCPromise
        }
      }

      @Injectable({ registry, token: TokC })
      class ServiceC {
        public readonly id = 'C'
        public readonly data = Array.from({ length: 300 }, () => 'c')
        @InjectLazy(TokA) accessor serviceAPromise!: Promise<ServiceA>

        async getA(): Promise<ServiceA> {
          return this.serviceAPromise
        }
      }

      let a: ServiceA | null = await container.get(TokA)
      let b: ServiceB | null = await container.get(TokB)
      let c: ServiceC | null = await container.get(TokC)

      // Verify the cycle: A -> B -> C -> A
      expect(await a.getB()).toBe(b)
      expect(await b.getC()).toBe(c)
      expect(await c.getA()).toBe(a)

      const trackerA = createGCTracker(a)
      const trackerB = createGCTracker(b)
      const trackerC = createGCTracker(c)

      await container.dispose()

      registry = new Registry()
      container = new Container({ registry })

      // Release local references
      a = null
      b = null
      c = null

      // All three should be collected
      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
      expect(await waitForGC(trackerC().ref)).toBe(true)
    })
  })

  describe('Circular dependencies with lifecycle hooks', () => {
    it('should call onServiceDestroy for all circular services', async () => {
      const destroyOrder: string[] = []
      const TokA = Token.create<ServiceA>('HookA')
      const TokB = Token.create<ServiceB>('HookB')

      @Injectable({ registry, token: TokA })
      class ServiceA implements OnServiceDestroy {
        public readonly id = 'A'
        @InjectLazy(TokB) accessor _serviceBPromise!: Promise<ServiceB>

        onServiceDestroy(): void {
          destroyOrder.push('A')
        }
      }

      @Injectable({ registry, token: TokB })
      class ServiceB implements OnServiceDestroy {
        public readonly id = 'B'
        @InjectLazy(TokA) accessor _serviceAPromise!: Promise<ServiceA>

        onServiceDestroy(): void {
          destroyOrder.push('B')
        }
      }

      let a: ServiceA | null = await container.get(TokA)
      let b: ServiceB | null = await container.get(TokB)

      const trackerA = createGCTracker(a)
      const trackerB = createGCTracker(b)

      await container.dispose()

      // Both destroy hooks should be called
      expect(destroyOrder).toContain('A')
      expect(destroyOrder).toContain('B')

      registry = new Registry()
      container = new Container({ registry })

      // Release local references
      a = null
      b = null

      // Both should be collected
      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
    })

    it('should handle async onServiceDestroy in circular services', async () => {
      const destroyCompleted: string[] = []
      const TokA = Token.create<ServiceA>('AsyncHookA')
      const TokB = Token.create<ServiceB>('AsyncHookB')

      @Injectable({ registry, token: TokA })
      class ServiceA implements OnServiceDestroy {
        @InjectLazy(TokB) accessor _serviceBPromise!: Promise<ServiceB>

        async onServiceDestroy(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 5))
          destroyCompleted.push('A')
        }
      }

      @Injectable({ registry, token: TokB })
      class ServiceB implements OnServiceDestroy {
        @InjectLazy(TokA) accessor _serviceAPromise!: Promise<ServiceA>

        async onServiceDestroy(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 5))
          destroyCompleted.push('B')
        }
      }

      let a: ServiceA | null = await container.get(TokA)
      let b: ServiceB | null = await container.get(TokB)

      const trackerA = createGCTracker(a)
      const trackerB = createGCTracker(b)

      await container.dispose()

      expect(destroyCompleted).toContain('A')
      expect(destroyCompleted).toContain('B')

      registry = new Registry()
      container = new Container({ registry })

      // Release local references
      a = null
      b = null

      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
    })
  })

  describe('Circular dependencies in request scope', () => {
    it('should collect request-scoped circular services on endRequest', async () => {
      const TokA = Token.create<RequestServiceA>('ReqCircA')
      const TokB = Token.create<RequestServiceB>('ReqCircB')

      @Injectable({ registry, scope: InjectableScope.Request, token: TokA })
      class RequestServiceA {
        public readonly id = Math.random()
        @InjectLazy(TokB) accessor serviceBPromise!: Promise<RequestServiceB>

        async getB(): Promise<RequestServiceB> {
          return this.serviceBPromise
        }
      }

      @Injectable({ registry, scope: InjectableScope.Request, token: TokB })
      class RequestServiceB {
        public readonly id = Math.random()
        @InjectLazy(TokA) accessor serviceAPromise!: Promise<RequestServiceA>

        async getA(): Promise<RequestServiceA> {
          return this.serviceAPromise
        }
      }

      const scoped = container.beginRequest('circular-request')

      let a: RequestServiceA | null = await scoped.get(TokA)
      let b: RequestServiceB | null = await scoped.get(TokB)

      // Verify circular reference
      expect(await a.getB()).toBe(b)
      expect(await b.getA()).toBe(a)

      const trackerA = createGCTracker(a)
      const trackerB = createGCTracker(b)

      await scoped.endRequest()

      // Release local references
      a = null
      b = null

      // Both should be collected
      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
    })
  })

  describe('Mixed scope circular dependencies', () => {
    it('should handle circular deps between singleton and request scope', async () => {
      const SingletonTok = Token.create<SingletonService>('MixedSingleton')
      const RequestTok = Token.create<RequestService>('MixedRequest')

      @Injectable({ registry, token: SingletonTok })
      class SingletonService {
        public readonly id = 'singleton'
        public readonly data = Array.from({ length: 500 }, () => 's')
        @InjectLazy(RequestTok) accessor requestServicePromise!: Promise<RequestService>

        async getRequestService(): Promise<RequestService> {
          return this.requestServicePromise
        }
      }

      @Injectable({ registry, scope: InjectableScope.Request, token: RequestTok })
      class RequestService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'r')
        @InjectLazy(SingletonTok) accessor singletonPromise!: Promise<SingletonService>

        async getSingleton(): Promise<SingletonService> {
          return this.singletonPromise
        }
      }

      const scoped = container.beginRequest('mixed-circular')

      let singleton: SingletonService | null = await scoped.get(SingletonTok)
      let request: RequestService | null = await scoped.get(RequestTok)

      const singletonTracker = createGCTracker(singleton)
      const requestTracker = createGCTracker(request)

      await scoped.endRequest()

      // Release local reference
      request = null
      singleton = null

      // Request-scoped should be collected
      expect(await waitForGC(requestTracker().ref)).toBe(true)

      // Singleton should remain (still in container)
      expect(singletonTracker().collected).toBe(true)
    })
  })

  describe('Memory reclamation with circular dependencies', () => {
    it('should not leak memory with repeated circular service creation', async () => {
      const ALLOCATION_SIZE = 1024 * 50 // 50KB
      const ITERATIONS = 10

      forceGC()
      const baselineMemory = getHeapUsed()

      for (let i = 0; i < ITERATIONS; i++) {
        const localRegistry = new Registry()
        const localContainer = new Container({ registry: localRegistry })
        const TokA = Token.create<ServiceA>(`LeakA${i}`)
        const TokB = Token.create<ServiceB>(`LeakB${i}`)

        @Injectable({ registry: localRegistry, token: TokA })
        class ServiceA {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
          @InjectLazy(TokB) accessor _serviceBPromise!: Promise<ServiceB>
        }

        @Injectable({ registry: localRegistry, token: TokB })
        class ServiceB {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
          @InjectLazy(TokA) accessor _serviceAPromise!: Promise<ServiceA>
        }

        await localContainer.get(TokA)
        await localContainer.get(TokB)

        await localContainer.dispose()
      }

      forceGC()
      const finalMemory = getHeapUsed()
      const memoryGrowth = finalMemory - baselineMemory

      // Memory growth should be minimal (less than 2 iteration's allocations)
      expect(memoryGrowth).toBeLessThan(ALLOCATION_SIZE * 2 * 2)
    })
  })
})
