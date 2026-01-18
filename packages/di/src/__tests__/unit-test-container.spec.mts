import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Injectable } from '../decorators/injectable.decorator.mjs'
import { UnitTestContainer } from '../testing/unit-test-container.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

describe('UnitTestContainer', () => {
  describe('Strict Mode (default)', () => {
    it('should resolve services from providers list', async () => {
      @Injectable()
      class UserService {
        getUser(): string {
          return 'user'
        }
      }

      const container = new UnitTestContainer({
        providers: [{ token: UserService }],
      })

      const service = await container.get(UserService)
      expect(service.getUser()).toBe('user')

      await container.dispose()
    })

    it('should throw when resolving unregistered service', async () => {
      @Injectable()
      class NotProvided {}

      const container = new UnitTestContainer({
        providers: [],
      })

      await expect(container.get(NotProvided)).rejects.toThrow(/not in the providers list/)

      await container.dispose()
    })

    it('should use provided value', async () => {
      const TOKEN = InjectionToken.create<{ value: string }>('config')

      const container = new UnitTestContainer({
        providers: [{ token: TOKEN, useValue: { value: 'test-config' } }],
      })

      const config = await container.get(TOKEN)
      expect(config.value).toBe('test-config')

      await container.dispose()
    })

    it('should use provided class', async () => {
      const TOKEN = InjectionToken.create<{ getName(): string }>('service')

      class MockService {
        getName(): string {
          return 'mock'
        }
      }

      const container = new UnitTestContainer({
        providers: [{ token: TOKEN, useClass: MockService }],
      })

      const service = await container.get(TOKEN)
      expect(service.getName()).toBe('mock')

      await container.dispose()
    })

    it('should use provided factory', async () => {
      const TOKEN = InjectionToken.create<{ id: number }>('factory')

      const container = new UnitTestContainer({
        providers: [{ token: TOKEN, useFactory: () => ({ id: 42 }) }],
      })

      const result = await container.get(TOKEN)
      expect(result.id).toBe(42)

      await container.dispose()
    })

    it('should support bound tokens in providers with useValue override', async () => {
      const configSchema = z.object({
        apiUrl: z.string(),
        timeout: z.number(),
      })

      const CONFIG_TOKEN = InjectionToken.create<
        { apiUrl: string; timeout: number },
        typeof configSchema
      >('CONFIG', configSchema)

      const BOUND_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
        apiUrl: 'https://default.com',
        timeout: 5000,
      })

      const container = new UnitTestContainer({
        providers: [
          {
            token: BOUND_CONFIG,
            useValue: { apiUrl: 'https://override.com', timeout: 10000 },
          },
        ],
      })

      const config = await container.get(BOUND_CONFIG)
      expect(config.apiUrl).toBe('https://override.com')
      expect(config.timeout).toBe(10000)

      await container.dispose()
    })

    it('should support bound tokens in providers with useClass override', async () => {
      const configSchema = z.object({
        apiUrl: z.string(),
      })

      const CONFIG_TOKEN = InjectionToken.create<{ apiUrl: string }, typeof configSchema>(
        'CONFIG',
        configSchema,
      )

      const BOUND_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
        apiUrl: 'https://default.com',
      })

      class TestConfig {
        apiUrl: string
        constructor() {
          this.apiUrl = 'https://class-override.com'
        }
      }

      const container = new UnitTestContainer({
        providers: [{ token: BOUND_CONFIG, useClass: TestConfig }],
      })

      const config = await container.get(BOUND_CONFIG)
      expect(config.apiUrl).toBe('https://class-override.com')

      await container.dispose()
    })

    it('should support bound tokens in providers with useFactory override', async () => {
      const configSchema = z.object({
        apiUrl: z.string(),
      })

      const CONFIG_TOKEN = InjectionToken.create<{ apiUrl: string }, typeof configSchema>(
        'CONFIG',
        configSchema,
      )

      const BOUND_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
        apiUrl: 'https://default.com',
      })

      const container = new UnitTestContainer({
        providers: [
          {
            token: BOUND_CONFIG,
            useFactory: () => ({ apiUrl: 'https://factory-override.com' }),
          },
        ],
      })

      const config = await container.get(BOUND_CONFIG)
      expect(config.apiUrl).toBe('https://factory-override.com')

      await container.dispose()
    })

    it('should support bound tokens in providers without override', async () => {
      const configSchema = z.object({
        apiUrl: z.string(),
        timeout: z.number(),
      })

      const CONFIG_TOKEN = InjectionToken.create<
        { apiUrl: string; timeout: number },
        typeof configSchema
      >('CONFIG', configSchema)

      const BOUND_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
        apiUrl: 'https://bound-value.com',
        timeout: 3000,
      })

      const container = new UnitTestContainer({
        providers: [{ token: BOUND_CONFIG }],
      })

      const config = await container.get(BOUND_CONFIG)
      expect(config.apiUrl).toBe('https://bound-value.com')
      expect(config.timeout).toBe(3000)

      await container.dispose()
    })
  })

  describe('Auto-Mock Mode', () => {
    it('should auto-mock unregistered services when enabled', async () => {
      @Injectable()
      class UnregisteredService {}

      const container = new UnitTestContainer({
        providers: [],
        allowUnregistered: true,
      })

      const service = await container.get(UnregisteredService)
      expect(service).toBeDefined()

      container.expectAutoMocked(UnregisteredService)

      await container.dispose()
    })

    it('should throw when accessing methods on auto-mocked service', async () => {
      @Injectable()
      class AutoMocked {
        doSomething(): void {}
      }

      const container = new UnitTestContainer({
        providers: [],
        allowUnregistered: true,
      })

      const service = (await container.get(AutoMocked)) as any

      expect(() => service.doSomething()).toThrow(/auto-mocked service/)

      await container.dispose()
    })

    it('should enable auto-mocking dynamically', async () => {
      @Injectable()
      class DynamicService {}

      const container = new UnitTestContainer({
        providers: [],
      })

      // Should throw initially
      await expect(container.get(DynamicService)).rejects.toThrow()

      // Enable auto-mocking
      container.enableAutoMocking()

      // Should work now
      const service = await container.get(DynamicService)
      expect(service).toBeDefined()

      await container.dispose()
    })

    it('should disable auto-mocking dynamically', async () => {
      @Injectable()
      class AnotherService {}

      const container = new UnitTestContainer({
        providers: [],
        allowUnregistered: true,
      })

      container.disableAutoMocking()

      await expect(container.get(AnotherService)).rejects.toThrow()

      await container.dispose()
    })
  })

  describe('Automatic Call Tracking', () => {
    let container: UnitTestContainer

    beforeEach(() => {
      container = new UnitTestContainer({
        providers: [],
      })
    })

    afterEach(async () => {
      await container.dispose()
    })

    it('should automatically track method calls via proxy', async () => {
      @Injectable()
      class TrackedService {
        process(data: string): string {
          return `processed: ${data}`
        }
      }

      const localContainer = new UnitTestContainer({
        providers: [{ token: TrackedService }],
      })

      const service = await localContainer.get(TrackedService)
      const result = service.process('test')

      expect(result).toBe('processed: test')
      localContainer.expectCalled(TrackedService, 'process')
      localContainer.expectCalledWith(TrackedService, 'process', ['test'])

      await localContainer.dispose()
    })

    it('should track multiple calls', async () => {
      @Injectable()
      class MultiCallService {
        action(): void {}
      }

      const localContainer = new UnitTestContainer({
        providers: [{ token: MultiCallService }],
      })

      const service = await localContainer.get(MultiCallService)
      service.action()
      service.action()
      service.action()

      localContainer.expectCallCount(MultiCallService, 'action', 3)

      await localContainer.dispose()
    })

    it('should track async method calls', async () => {
      @Injectable()
      class AsyncService {
        async fetchData(id: string): Promise<{ id: string }> {
          return { id }
        }
      }

      const localContainer = new UnitTestContainer({
        providers: [{ token: AsyncService }],
      })

      const service = await localContainer.get(AsyncService)
      const result = await service.fetchData('123')

      expect(result.id).toBe('123')
      localContainer.expectCalled(AsyncService, 'fetchData')
      localContainer.expectCalledWith(AsyncService, 'fetchData', ['123'])

      await localContainer.dispose()
    })

    it('should assert method was NOT called', async () => {
      @Injectable()
      class SomeService {
        neverCalled(): void {}
        called(): void {}
      }

      const localContainer = new UnitTestContainer({
        providers: [{ token: SomeService }],
      })

      const service = await localContainer.get(SomeService)
      service.called()

      localContainer.expectNotCalled(SomeService, 'neverCalled')
      localContainer.expectCalled(SomeService, 'called')

      await localContainer.dispose()
    })
  })

  describe('Assertion Helpers', () => {
    it('should assert service is resolved', async () => {
      @Injectable()
      class ResolvedService {}

      const container = new UnitTestContainer({
        providers: [{ token: ResolvedService }],
      })

      await container.get(ResolvedService)

      expect(() => container.expectResolved(ResolvedService)).not.toThrow()

      await container.dispose()
    })

    it('should assert service is NOT resolved', async () => {
      @Injectable()
      class NotResolvedService {}

      const container = new UnitTestContainer({
        providers: [{ token: NotResolvedService }],
      })

      expect(() => container.expectNotResolved(NotResolvedService)).not.toThrow()

      await container.dispose()
    })

    it('should assert service is auto-mocked', async () => {
      @Injectable()
      class AutoMockedService {}

      const container = new UnitTestContainer({
        providers: [],
        allowUnregistered: true,
      })

      await container.get(AutoMockedService)

      expect(() => container.expectAutoMocked(AutoMockedService)).not.toThrow()

      await container.dispose()
    })

    it('should assert service is NOT auto-mocked', async () => {
      @Injectable()
      class RealService {}

      const container = new UnitTestContainer({
        providers: [{ token: RealService }],
      })

      await container.get(RealService)

      expect(() => container.expectNotAutoMocked(RealService)).not.toThrow()

      await container.dispose()
    })
  })

  describe('Service Stats', () => {
    it('should get service stats', async () => {
      @Injectable()
      class StatsService {
        method1(): void {}
        method2(arg: string): string {
          return arg
        }
      }

      const container = new UnitTestContainer({
        providers: [{ token: StatsService }],
      })

      const service = await container.get(StatsService)
      service.method1()
      service.method2('test')

      const stats = container.getServiceStats(StatsService)
      expect(stats.methodCalls.length).toBe(2)

      await container.dispose()
    })

    it('should get registered token IDs', async () => {
      @Injectable()
      class Service1 {}

      @Injectable()
      class Service2 {}

      const container = new UnitTestContainer({
        providers: [{ token: Service1 }, { token: Service2 }],
      })

      const tokenIds = container.getRegisteredTokenIds()
      expect(tokenIds.size).toBe(2)

      await container.dispose()
    })

    it('should get auto-mocked token IDs', async () => {
      @Injectable()
      class Mock1 {}

      @Injectable()
      class Mock2 {}

      const container = new UnitTestContainer({
        providers: [],
        allowUnregistered: true,
      })

      await container.get(Mock1)
      await container.get(Mock2)

      const autoMocked = container.getAutoMockedTokenIds()
      expect(autoMocked.size).toBe(2)

      await container.dispose()
    })
  })

  describe('Clear', () => {
    it('should clear all state', async () => {
      @Injectable()
      class ClearableService {
        action(): void {}
      }

      const container = new UnitTestContainer({
        providers: [{ token: ClearableService }],
      })

      const service = await container.get(ClearableService)
      service.action()

      container.expectResolved(ClearableService)
      container.expectCalled(ClearableService, 'action')

      await container.clear()

      container.expectNotResolved(ClearableService)
      expect(container.getMethodCalls(ClearableService)).toHaveLength(0)
    })
  })
})
