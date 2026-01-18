import { Injectable, InjectableScope, InjectionToken } from '@navios/di'
import { afterEach, describe, expect, it } from 'vitest'

import { Module } from '../decorators/module.decorator.mjs'
import { createTestingModule, TestingModule } from '../testing/testing-module.mjs'

describe('TestingModule', () => {
  let testingModule: TestingModule | null = null

  afterEach(async () => {
    if (testingModule) {
      await testingModule.close()
      testingModule = null
    }
  })

  describe('create', () => {
    it('should create a testing module with static create method', () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })

      expect(testingModule).toBeInstanceOf(TestingModule)
    })

    it('should apply initial overrides from options', async () => {
      const TOKEN = InjectionToken.create<string>('test-token')

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, {
        adapter: [],
        overrides: [{ token: TOKEN, useValue: 'overridden-value' }],
      })

      await testingModule.compile()
      const value = await testingModule.get(TOKEN)

      expect(value).toBe('overridden-value')
    })
  })

  describe('createTestingModule (deprecated)', () => {
    it('should still work for backwards compatibility', () => {
      @Module()
      class TestAppModule {}

      testingModule = createTestingModule(TestAppModule, { adapter: [] })

      expect(testingModule).toBeInstanceOf(TestingModule)
    })
  })

  describe('compile', () => {
    it('should return this for chaining', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      const result = await testingModule.compile()

      expect(result).toBe(testingModule)
    })

    it('should only compile once even when called multiple times', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })

      const result1 = await testingModule.compile()
      const app1 = result1.getApp()

      const result2 = await testingModule.compile()
      const app2 = result2.getApp()

      expect(app1).toBe(app2)
    })
  })

  describe('init', () => {
    it('should return this for chaining', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      const result = await testingModule.init()

      expect(result).toBe(testingModule)
    })

    it('should compile automatically if not already compiled', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.init()

      expect(() => testingModule!.getApp()).not.toThrow()
    })

    it('should start a request scope after init', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.init()

      expect(() => testingModule!.getScopedContainer()).not.toThrow()
    })
  })

  describe('getApp', () => {
    it('should throw if not compiled', () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })

      expect(() => testingModule!.getApp()).toThrow(
        'TestingModule not compiled. Call compile() or init() first.',
      )
    })

    it('should return the app after compile', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      const app = testingModule.getApp()
      expect(app).toBeDefined()
    })
  })

  describe('getScopedContainer', () => {
    it('should throw if init was not called', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      expect(() => testingModule!.getScopedContainer()).toThrow(
        'No scoped container available. Call init() first.',
      )
    })

    it('should return scoped container after init', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.init()

      const scopedContainer = testingModule.getScopedContainer()
      expect(scopedContainer).toBeDefined()
    })
  })

  describe('overrideProvider', () => {
    it('should override with useValue', async () => {
      @Injectable()
      class OriginalService {
        getValue() {
          return 'original'
        }
      }

      @Module()
      class TestAppModule {}

      const mockService = { getValue: () => 'mocked' }

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
        .overrideProvider(OriginalService)
        .useValue(mockService)

      await testingModule.compile()
      const service = await testingModule.get(OriginalService)

      expect(service.getValue()).toBe('mocked')
    })

    it('should override with useClass', async () => {
      @Injectable()
      class OriginalService {
        getValue() {
          return 'original'
        }
      }

      @Injectable()
      class MockService {
        getValue() {
          return 'mocked-class'
        }
      }

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
        .overrideProvider(OriginalService)
        .useClass(MockService)

      await testingModule.compile()
      const service = await testingModule.get(OriginalService)

      expect(service.getValue()).toBe('mocked-class')
    })

    it('should support chaining multiple overrides', async () => {
      @Injectable()
      class ServiceA {
        getValue() {
          return 'a'
        }
      }

      @Injectable()
      class ServiceB {
        getValue() {
          return 'b'
        }
      }

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
        .overrideProvider(ServiceA)
        .useValue({ getValue: () => 'mocked-a' })
        .overrideProvider(ServiceB)
        .useValue({ getValue: () => 'mocked-b' })

      await testingModule.compile()

      const serviceA = await testingModule.get(ServiceA)
      const serviceB = await testingModule.get(ServiceB)

      expect(serviceA.getValue()).toBe('mocked-a')
      expect(serviceB.getValue()).toBe('mocked-b')
    })
  })

  describe('get', () => {
    it('should resolve services after compile', async () => {
      @Injectable()
      class TestService {
        getValue() {
          return 'test'
        }
      }

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      const service = await testingModule.get(TestService)
      expect(service.getValue()).toBe('test')
    })

    it('should resolve request-scoped services after init', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestScopedService {
        getValue() {
          return 'request-scoped'
        }
      }

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.init()

      const service = await testingModule.get(RequestScopedService)
      expect(service.getValue()).toBe('request-scoped')
    })
  })

  describe('close', () => {
    it('should clean up all resources', async () => {
      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.init()

      await testingModule.close()

      // After close, getApp and getScopedContainer should throw
      expect(() => testingModule!.getApp()).toThrow()
      expect(() => testingModule!.getScopedContainer()).toThrow()

      testingModule = null // Prevent afterEach from calling close again
    })
  })

  describe('assertion helpers', () => {
    it('should expose expectResolved', async () => {
      @Injectable()
      class TestService {}

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      await testingModule.get(TestService)

      expect(() => testingModule!.expectResolved(TestService)).not.toThrow()
    })

    it('should expose expectNotResolved', async () => {
      @Injectable()
      class TestService {}

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      expect(() => testingModule!.expectNotResolved(TestService)).not.toThrow()
    })

    it('should expose expectSingleton', async () => {
      @Injectable({ scope: InjectableScope.Singleton })
      class SingletonService {}

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      expect(() => testingModule!.expectSingleton(SingletonService)).not.toThrow()
    })

    it('should expose expectTransient', async () => {
      @Injectable({ scope: InjectableScope.Transient })
      class TransientService {}

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      expect(() => testingModule!.expectTransient(TransientService)).not.toThrow()
    })

    it('should expose expectRequestScoped', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {}

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      expect(() => testingModule!.expectRequestScoped(RequestService)).not.toThrow()
    })
  })

  describe('method call tracking', () => {
    it('should record and assert method calls', async () => {
      @Injectable()
      class MockService {
        doSomething(arg: string) {
          return arg.toUpperCase()
        }
      }

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      // Manually record a method call (typically done in mock implementations)
      testingModule.recordMethodCall(MockService, 'doSomething', ['test'], 'TEST')

      expect(() => testingModule!.expectCalled(MockService, 'doSomething')).not.toThrow()
      expect(() =>
        testingModule!.expectCalledWith(MockService, 'doSomething', ['test']),
      ).not.toThrow()
      expect(() => testingModule!.expectCallCount(MockService, 'doSomething', 1)).not.toThrow()
    })

    it('should get method calls for custom assertions', async () => {
      @Injectable()
      class MockService {}

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      testingModule.recordMethodCall(MockService, 'method1', ['a'])
      testingModule.recordMethodCall(MockService, 'method2', ['b', 'c'])

      const calls = testingModule.getMethodCalls(MockService)

      expect(calls).toHaveLength(2)
      expect(calls[0].method).toBe('method1')
      expect(calls[1].method).toBe('method2')
    })
  })

  describe('dependency graph', () => {
    it('should expose getDependencyGraph', async () => {
      @Injectable()
      class TestService {}

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      await testingModule.get(TestService)

      const graph = testingModule.getDependencyGraph()

      expect(graph).toHaveProperty('nodes')
      expect(graph).toHaveProperty('rootTokens')
    })

    it('should expose getSimplifiedDependencyGraph', async () => {
      @Injectable()
      class TestService {}

      @Module()
      class TestAppModule {}

      testingModule = TestingModule.create(TestAppModule, { adapter: [] })
      await testingModule.compile()

      await testingModule.get(TestService)

      const graph = testingModule.getSimplifiedDependencyGraph()

      expect(typeof graph).toBe('object')
    })
  })
})
