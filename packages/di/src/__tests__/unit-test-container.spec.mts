import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Injectable } from '../decorators/injectable.mjs'
import { DIError, DIErrorCode } from '../errors/di-error.mjs'
import { asyncInject, inject, optional } from '../internal/inject-impl.mjs'
import { UnitTestContainer } from '../testing/unit-test-container.mjs'
import { getInjectableToken } from '../token/injectable-token.mjs'
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

    it('should report an unregistered service with a readable message', async () => {
      @Injectable()
      class NotProvided {}

      const container = new UnitTestContainer({
        providers: [],
      })

      const error = await container.get(NotProvided).catch((e) => e)
      expect(error).toBeInstanceOf(DIError)
      expect(error.code).toBe(DIErrorCode.ProviderNotFound)
      expect(error.context).toEqual({ name: 'NotProvided', path: [] })
      expect(error.message).toBe(
        '[UnitTestContainer] NotProvided is not in the providers list. ' +
          'Add it to providers, or set allowUnregistered: true to get an auto-mock for it.',
      )
      expect(() => container.getSync(NotProvided)).toThrow(error.message)

      await container.dispose()
    })

    it('should not resolve a nested dependency that is not in the providers list', async () => {
      @Injectable()
      class Dependency {}

      @Injectable()
      class Service {
        readonly dependency = inject(Dependency)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Service }],
      })

      await expect(container.get(Service)).rejects.toThrow(/Dependency/)

      await container.dispose()
    })

    it('should not build the real class of an unlisted nested dependency when auto-mocking', async () => {
      let constructed = 0

      @Injectable()
      class Dependency {
        constructor() {
          constructed++
        }
      }

      @Injectable()
      class Service {
        readonly dependency = inject(Dependency)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Service }],
        allowUnregistered: true,
      })

      const service = await container.get(Service)

      expect(constructed).toBe(0)
      expect(service.dependency).not.toBeInstanceOf(Dependency)
      container.expectAutoMocked(Dependency)

      await container.dispose()
    })

    it('should resolve a nested dependency from the providers list', async () => {
      @Injectable()
      class Dependency {
        getValue(): string {
          return 'real'
        }
      }

      @Injectable()
      class Service {
        readonly dependency = inject(Dependency)
      }

      const container = new UnitTestContainer({
        providers: [
          { token: Service },
          { token: Dependency, useValue: { getValue: () => 'mock' } },
        ],
      })

      const service = await container.get(Service)
      expect(service.dependency.getValue()).toBe('mock')

      await container.dispose()
    })

    it('should accept a class without @Injectable as a provider token', async () => {
      class Plain {
        getValue(): string {
          return 'plain'
        }
      }

      const container = new UnitTestContainer({
        providers: [{ token: Plain }],
      })

      const service = await container.get(Plain)
      expect(service.getValue()).toBe('plain')
      container.expectCalled(Plain, 'getValue')

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

    it('rejects a bound token in providers without a use* option', () => {
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

      expect(() => new UnitTestContainer({ providers: [{ token: BOUND_CONFIG }] })).toThrow(
        /CONFIG is listed as a bound token without useValue, useClass or useFactory/,
      )
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

    it('should explain how to fix an access to an auto-mocked service', async () => {
      @Injectable()
      class AutoMocked {
        doSomething(): void {}
      }

      const container = new UnitTestContainer({
        providers: [],
        allowUnregistered: true,
      })

      const service = (await container.get(AutoMocked)) as any
      expect(() => service.doSomething()).toThrow(
        "[UnitTestContainer] Attempted to access 'doSomething' on auto-mocked service 'AutoMocked'. " +
          'This service is not in the providers list. ' +
          'Add it to providers, or set allowUnregistered: false to fail as soon as it is requested.',
      )

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

    it('should track calls on instances returned by getSync', async () => {
      @Injectable()
      class SyncService {
        process(data: string): string {
          return data
        }
      }

      @Injectable()
      class NotProvided {}

      const localContainer = new UnitTestContainer({
        providers: [{ token: SyncService }],
      })

      localContainer.getSync(SyncService).process('test')

      localContainer.expectCalledWith(SyncService, 'process', ['test'])
      expect(() => localContainer.getSync(NotProvided)).toThrow(/not in the providers list/)

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

    it('should get registered tokens', async () => {
      @Injectable()
      class Service1 {}

      @Injectable()
      class Service2 {}

      const container = new UnitTestContainer({
        providers: [{ token: Service1 }, { token: Service2 }],
      })

      const tokens = container.getRegisteredTokens()
      expect(tokens.size).toBe(2)
      expect(tokens.has(getInjectableToken(Service1))).toBe(true)
      expect(tokens.has(getInjectableToken(Service2))).toBe(true)

      await container.dispose()
    })

    it('should get auto-mocked tokens', async () => {
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

      const autoMocked = container.getAutoMockedTokens()
      expect(autoMocked.size).toBe(2)
      expect(autoMocked.has(getInjectableToken(Mock1))).toBe(true)
      expect(autoMocked.has(getInjectableToken(Mock2))).toBe(true)

      await container.dispose()
    })
  })

  describe('Unlisted dependencies of a listed service', () => {
    it('should give inject() an auto-mock when allowUnregistered is true', async () => {
      @Injectable()
      class Mailer {
        send(): void {}
      }

      @Injectable()
      class Signup {
        mailer = inject(Mailer)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
        allowUnregistered: true,
      })

      const signup = await container.get(Signup)

      expect(signup.mailer).toBeDefined()
      expect(signup.mailer).not.toBeInstanceOf(Mailer)
      expect(() => signup.mailer.send()).toThrow(
        "[UnitTestContainer] Attempted to access 'send' on auto-mocked service 'Mailer'.",
      )
      container.expectAutoMocked(Mailer)
      container.expectNotAutoMocked(Signup)
      expect(container.getAutoMockedTokens().has(getInjectableToken(Mailer))).toBe(true)

      await container.dispose()
    })

    it('should resolve synchronously with an auto-mocked dependency', () => {
      @Injectable()
      class Mailer {}

      @Injectable()
      class Signup {
        mailer = inject(Mailer)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
        allowUnregistered: true,
      })

      const signup = container.getSync(Signup)
      expect(signup.mailer).toBe(container.getSync(Mailer))
    })

    it('should hand out one auto-mock per token, whoever asks', async () => {
      @Injectable()
      class Mailer {}

      @Injectable()
      class Signup {
        mailer = inject(Mailer)
      }

      @Injectable()
      class Reminder {
        mailer = inject(Mailer)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }, { token: Reminder }],
        allowUnregistered: true,
      })

      const direct = await container.get(Mailer)
      const signup = await container.get(Signup)
      const reminder = await container.get(Reminder)

      expect(signup.mailer).toBe(direct)
      expect(reminder.mailer).toBe(direct)

      await container.dispose()
    })

    it('should give optional() the auto-mock when allowUnregistered is true', async () => {
      @Injectable()
      class Metrics {}

      @Injectable()
      class Signup {
        metrics = optional(Metrics)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
        allowUnregistered: true,
      })

      const signup = await container.get(Signup)

      expect(signup.metrics).not.toBeNull()
      expect(signup.metrics).toBe(await container.get(Metrics))
      container.expectAutoMocked(Metrics)

      await container.dispose()
    })

    it('should give asyncInject() the auto-mock when allowUnregistered is true', async () => {
      @Injectable()
      class Mailer {
        send(): void {}
      }

      @Injectable()
      class Signup {
        mailer = asyncInject(Mailer)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
        allowUnregistered: true,
      })

      const signup = await container.get(Signup)
      const mailer = await signup.mailer

      expect(mailer).toBe(await container.get(Mailer))
      expect(() => mailer.send()).toThrow(/auto-mocked service 'Mailer'/)
      container.expectAutoMocked(Mailer)

      await container.dispose()
    })

    it('should auto-mock an unlisted token that has no default provider', async () => {
      const Config = InjectionToken.create<{ url: string }>('Config')

      @Injectable()
      class Client {
        config = inject(Config)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Client }],
        allowUnregistered: true,
      })

      const client = await container.get(Client)

      expect(() => client.config.url).toThrow(/auto-mocked service 'Config'/)
      container.expectAutoMocked(Config)

      await container.dispose()
    })

    it('should not mark a token as auto-mocked before it is requested', async () => {
      @Injectable()
      class Mailer {}

      @Injectable()
      class Signup {}

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
        allowUnregistered: true,
      })

      await container.get(Signup)

      expect(container.isRegistered(Mailer)).toBe(false)
      expect(() => container.expectAutoMocked(Mailer)).toThrow(/to be auto-mocked/)
      container.expectNotResolved(Mailer)

      await container.dispose()
    })

    it('should keep isRegistered() false for an auto-mocked token', async () => {
      @Injectable()
      class Mailer {}

      @Injectable()
      class Signup {
        mailer = inject(Mailer)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
        allowUnregistered: true,
      })

      await container.get(Signup)

      expect(container.isRegistered(Signup)).toBe(true)
      expect(container.isRegistered(Mailer)).toBe(false)

      await container.dispose()
    })

    it('should start with fresh auto-mocks after clear()', async () => {
      @Injectable()
      class Mailer {}

      @Injectable()
      class Signup {
        mailer = inject(Mailer)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
        allowUnregistered: true,
      })

      await container.get(Signup)
      await container.clear()

      expect(container.getAutoMockedTokens().size).toBe(0)
      const signup = await container.get(Signup)
      expect(signup.mailer).toBeDefined()
      container.expectAutoMocked(Mailer)

      await container.dispose()
    })

    it('should still fail inject() of an unlisted token when allowUnregistered is false', async () => {
      @Injectable()
      class Mailer {}

      @Injectable()
      class Signup {
        mailer = inject(Mailer)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
      })

      const error = await container.get(Signup).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(DIError)
      expect((error as DIError).code).toBe(DIErrorCode.ProviderNotFound)
      expect(container.getAutoMockedTokens().size).toBe(0)

      await container.dispose()
    })

    it('should still fail asyncInject() of an unlisted token when allowUnregistered is false', async () => {
      @Injectable()
      class Mailer {}

      @Injectable()
      class Signup {
        mailer = asyncInject(Mailer)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
      })

      const signup = await container.get(Signup)

      await expect(signup.mailer).rejects.toMatchObject({ code: DIErrorCode.ProviderNotFound })

      await container.dispose()
    })

    it('should keep optional() returning null when allowUnregistered is false', async () => {
      @Injectable()
      class Metrics {}

      @Injectable()
      class Signup {
        metrics = optional(Metrics)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }],
      })

      const signup = await container.get(Signup)

      expect(signup.metrics).toBeNull()
      expect(container.getAutoMockedTokens().size).toBe(0)

      await container.dispose()
    })

    it('should follow enableAutoMocking() and disableAutoMocking()', async () => {
      @Injectable()
      class Mailer {}

      @Injectable()
      class Signup {
        mailer = inject(Mailer)
      }

      @Injectable()
      class Audit {}

      @Injectable()
      class Reminder {
        audit = inject(Audit)
      }

      const container = new UnitTestContainer({
        providers: [{ token: Signup }, { token: Reminder }],
      })

      container.enableAutoMocking()
      const signup = await container.get(Signup)
      expect(signup.mailer).toBeDefined()

      container.disableAutoMocking()
      await expect(container.get(Reminder)).rejects.toMatchObject({
        code: DIErrorCode.ProviderNotFound,
      })

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
