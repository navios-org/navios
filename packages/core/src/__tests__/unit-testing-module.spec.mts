import { Injectable, InjectionToken } from '@navios/di'
import { afterEach, describe, expect, it } from 'vitest'

import { UnitTestingModule } from '../testing/unit-testing-module.mjs'

describe('UnitTestingModule', () => {
  let unitTestingModule: UnitTestingModule | null = null

  afterEach(async () => {
    if (unitTestingModule) {
      await unitTestingModule.close()
      unitTestingModule = null
    }
  })

  describe('create', () => {
    it('should create a unit testing module with providers', async () => {
      @Injectable()
      class TestService {
        getValue() {
          return 'test'
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      expect(unitTestingModule).toBeInstanceOf(UnitTestingModule)
    })

    it('should create with useValue provider', async () => {
      const TOKEN = InjectionToken.create<string>('test-token')

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TOKEN, useValue: 'test-value' }],
      })

      const value = await unitTestingModule.get(TOKEN)
      expect(value).toBe('test-value')
    })

    it('should create with useClass provider', async () => {
      @Injectable()
      class OriginalService {
        getValue() {
          return 'original'
        }
      }

      @Injectable()
      class MockService {
        getValue() {
          return 'mock'
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: OriginalService, useClass: MockService }],
      })

      const service = await unitTestingModule.get(OriginalService)
      expect(service.getValue()).toBe('mock')
    })

    it('should create with useFactory provider', async () => {
      const TOKEN = InjectionToken.create<{ value: string }>('factory-token')

      unitTestingModule = UnitTestingModule.create({
        providers: [
          {
            token: TOKEN,
            useFactory: () => ({ value: 'from-factory' }),
          },
        ],
      })

      const instance = await unitTestingModule.get(TOKEN)
      expect(instance.value).toBe('from-factory')
    })
  })

  describe('get', () => {
    it('should resolve registered providers', async () => {
      @Injectable()
      class TestService {
        getValue() {
          return 'test'
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      const service = await unitTestingModule.get(TestService)
      expect(service.getValue()).toBe('test')
    })

    it('should throw for unregistered providers in strict mode', async () => {
      @Injectable()
      class RegisteredService {}

      @Injectable()
      class UnregisteredService {}

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: RegisteredService, useClass: RegisteredService }],
        allowUnregistered: false,
      })

      await expect(unitTestingModule.get(UnregisteredService)).rejects.toThrow()
    })

    it('should auto-mock unregistered providers when allowUnregistered is true', async () => {
      @Injectable()
      class RegisteredService {}

      @Injectable()
      class UnregisteredService {}

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: RegisteredService, useClass: RegisteredService }],
        allowUnregistered: true,
      })

      const unregistered = await unitTestingModule.get(UnregisteredService)

      // Auto-mocked service should exist but throw on method access
      expect(unregistered).toBeDefined()
    })
  })

  describe('auto-mocking', () => {
    it('should enable auto-mocking with enableAutoMocking()', async () => {
      @Injectable()
      class UnregisteredService {}

      unitTestingModule = UnitTestingModule.create({
        providers: [],
        allowUnregistered: false,
      })

      unitTestingModule.enableAutoMocking()

      const service = await unitTestingModule.get(UnregisteredService)
      expect(service).toBeDefined()
    })

    it('should disable auto-mocking with disableAutoMocking()', async () => {
      @Injectable()
      class UnregisteredService {}

      unitTestingModule = UnitTestingModule.create({
        providers: [],
        allowUnregistered: true,
      })

      unitTestingModule.disableAutoMocking()

      await expect(unitTestingModule.get(UnregisteredService)).rejects.toThrow()
    })

    it('should track auto-mocked services', async () => {
      @Injectable()
      class UnregisteredService {}

      unitTestingModule = UnitTestingModule.create({
        providers: [],
        allowUnregistered: true,
      })

      await unitTestingModule.get(UnregisteredService)

      expect(() => unitTestingModule!.expectAutoMocked(UnregisteredService)).not.toThrow()
    })
  })

  describe('automatic method call tracking', () => {
    it('should automatically track method calls via proxy', async () => {
      @Injectable()
      class TestService {
        greet(name: string) {
          return `Hello, ${name}!`
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      const service = await unitTestingModule.get(TestService)
      service.greet('World')

      expect(() => unitTestingModule!.expectCalled(TestService, 'greet')).not.toThrow()
      expect(() =>
        unitTestingModule!.expectCalledWith(TestService, 'greet', ['World']),
      ).not.toThrow()
    })

    it('should track multiple method calls', async () => {
      @Injectable()
      class TestService {
        methodA() {
          return 'a'
        }
        methodB(x: number, y: number) {
          return x + y
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      const service = await unitTestingModule.get(TestService)
      service.methodA()
      service.methodB(1, 2)
      service.methodB(3, 4)

      expect(() => unitTestingModule!.expectCallCount(TestService, 'methodA', 1)).not.toThrow()
      expect(() => unitTestingModule!.expectCallCount(TestService, 'methodB', 2)).not.toThrow()
    })

    it('should track async method calls', async () => {
      @Injectable()
      class AsyncService {
        async fetchData(id: string) {
          return { id, data: 'fetched' }
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: AsyncService, useClass: AsyncService }],
      })

      const service = await unitTestingModule.get(AsyncService)
      await service.fetchData('123')

      expect(() => unitTestingModule!.expectCalled(AsyncService, 'fetchData')).not.toThrow()
      expect(() =>
        unitTestingModule!.expectCalledWith(AsyncService, 'fetchData', ['123']),
      ).not.toThrow()
    })

    it('should expose getMethodCalls for custom assertions', async () => {
      @Injectable()
      class TestService {
        process(value: string) {
          return value.toUpperCase()
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      const service = await unitTestingModule.get(TestService)
      service.process('hello')
      service.process('world')

      const calls = unitTestingModule.getMethodCalls(TestService)

      expect(calls).toHaveLength(2)
      expect(calls[0].args).toEqual(['hello'])
      expect(calls[0].result).toBe('HELLO')
      expect(calls[1].args).toEqual(['world'])
      expect(calls[1].result).toBe('WORLD')
    })
  })

  describe('assertion helpers', () => {
    it('should expose expectResolved', async () => {
      @Injectable()
      class TestService {}

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      await unitTestingModule.get(TestService)

      expect(() => unitTestingModule!.expectResolved(TestService)).not.toThrow()
    })

    it('should expose expectNotResolved', async () => {
      @Injectable()
      class TestService {}

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      expect(() => unitTestingModule!.expectNotResolved(TestService)).not.toThrow()
    })

    it('should expose expectNotCalled', async () => {
      @Injectable()
      class TestService {
        method() {
          return 'test'
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      await unitTestingModule.get(TestService)
      // Method not called

      expect(() => unitTestingModule!.expectNotCalled(TestService, 'method')).not.toThrow()
    })
  })

  describe('service stats', () => {
    it('should get service stats', async () => {
      @Injectable()
      class TestService {
        doWork() {
          return 'done'
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      const service = await unitTestingModule.get(TestService)
      service.doWork()
      service.doWork()

      const stats = unitTestingModule.getServiceStats(TestService)

      expect(stats.methodCalls).toHaveLength(2)
      expect(stats.methodCalls[0].method).toBe('doWork')
    })
  })

  describe('clearMethodCalls', () => {
    it('should clear all method calls', async () => {
      @Injectable()
      class TestService {
        method() {
          return 'test'
        }
      }

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      const service = await unitTestingModule.get(TestService)
      service.method()
      service.method()

      expect(unitTestingModule.getMethodCalls(TestService)).toHaveLength(2)

      unitTestingModule.clearMethodCalls()

      expect(unitTestingModule.getMethodCalls(TestService)).toHaveLength(0)
    })
  })

  describe('registered and auto-mocked token tracking', () => {
    it('should track registered token IDs', async () => {
      @Injectable()
      class ServiceA {}

      @Injectable()
      class ServiceB {}

      unitTestingModule = UnitTestingModule.create({
        providers: [
          { token: ServiceA, useClass: ServiceA },
          { token: ServiceB, useClass: ServiceB },
        ],
      })

      const registeredIds = unitTestingModule.getRegisteredTokenIds()

      expect(registeredIds.size).toBe(2)
    })

    it('should track auto-mocked token IDs', async () => {
      @Injectable()
      class UnregisteredA {}

      @Injectable()
      class UnregisteredB {}

      unitTestingModule = UnitTestingModule.create({
        providers: [],
        allowUnregistered: true,
      })

      await unitTestingModule.get(UnregisteredA)
      await unitTestingModule.get(UnregisteredB)

      const autoMockedIds = unitTestingModule.getAutoMockedTokenIds()

      expect(autoMockedIds.size).toBe(2)
    })
  })

  describe('close', () => {
    it('should clean up resources', async () => {
      @Injectable()
      class TestService {}

      unitTestingModule = UnitTestingModule.create({
        providers: [{ token: TestService, useClass: TestService }],
      })

      await unitTestingModule.get(TestService)
      await unitTestingModule.close()

      // After close, method calls should be cleared
      expect(unitTestingModule.getMethodCalls(TestService)).toHaveLength(0)

      unitTestingModule = null // Prevent afterEach from calling close again
    })
  })
})
