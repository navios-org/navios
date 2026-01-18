import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { TestContainer } from '../testing/test-container.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

describe('TestContainer', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Binding API', () => {
    it('should bind a value to a token', async () => {
      const TOKEN = InjectionToken.create<string>('test-token')
      const testValue = 'hello world'

      container.bind(TOKEN).toValue(testValue)

      const result = await container.get(TOKEN)
      expect(result).toBe(testValue)
    })

    it('should bind a class to a token', async () => {
      const TOKEN = InjectionToken.create<{ getValue(): string }>('service-token')

      class MockService {
        getValue(): string {
          return 'mock value'
        }
      }

      container.bind(TOKEN).toClass(MockService)

      const result = await container.get(TOKEN)
      expect(result.getValue()).toBe('mock value')
    })

    it('should bind a factory to a token', async () => {
      const TOKEN = InjectionToken.create<{ id: number }>('factory-token')

      let counter = 0
      container.bind(TOKEN).toFactory(() => ({ id: ++counter }))

      const result = await container.get(TOKEN)
      expect(result.id).toBe(1)
    })

    it('should clear all bindings', async () => {
      const TOKEN = InjectionToken.create<string>('clear-token')
      container.bind(TOKEN).toValue('test')

      await container.get(TOKEN)
      container.expectResolved(TOKEN)

      await container.clear()

      container.expectNotResolved(TOKEN)
    })
  })

  describe('Assertion Helpers', () => {
    @Injectable()
    class SimpleService {
      getValue(): string {
        return 'simple'
      }
    }

    it('should assert service is resolved', async () => {
      await container.get(SimpleService)

      expect(() => container.expectResolved(SimpleService)).not.toThrow()
    })

    it('should assert service is NOT resolved', () => {
      @Injectable()
      class UnresolvedService {}

      expect(() => container.expectNotResolved(UnresolvedService)).not.toThrow()
    })

    it('should throw when expecting resolved but not resolved', () => {
      @Injectable()
      class NeverResolved {}

      expect(() => container.expectResolved(NeverResolved)).toThrow(/to be resolved/)
    })

    it('should throw when expecting not resolved but was resolved', async () => {
      await container.get(SimpleService)

      expect(() => container.expectNotResolved(SimpleService)).toThrow(/to NOT be resolved/)
    })

    it('should assert singleton scope', async () => {
      await container.get(SimpleService)

      expect(() => container.expectSingleton(SimpleService)).not.toThrow()
    })

    it('should assert transient scope', async () => {
      @Injectable({ scope: InjectableScope.Transient })
      class TransientService {}

      await container.get(TransientService)

      expect(() => container.expectTransient(TransientService)).not.toThrow()
    })

    it('should assert request scope', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {}

      expect(() => container.expectRequestScoped(RequestService)).not.toThrow()
    })
  })

  describe('Instance Assertions', () => {
    it('should assert same instance for singleton', async () => {
      @Injectable()
      class SingletonService {}

      await expect(container.expectSameInstance(SingletonService)).resolves.not.toThrow()
    })

    it('should assert different instances for transient', async () => {
      @Injectable({ scope: InjectableScope.Transient })
      class TransientService {}

      await expect(container.expectDifferentInstances(TransientService)).resolves.not.toThrow()
    })
  })

  describe('Method Call Tracking', () => {
    it('should record method calls', async () => {
      const TOKEN = InjectionToken.create<{ doWork(x: number): number }>('work-token')

      class MockWorker {
        doWork(x: number): number {
          return x * 2
        }
      }

      container.bind(TOKEN).toClass(MockWorker)
      const worker = await container.get(TOKEN)

      // Record the call manually (TestContainer requires manual recording)
      const result = worker.doWork(5)
      container.recordMethodCall(TOKEN, 'doWork', [5], result)

      expect(() => container.expectCalled(TOKEN, 'doWork')).not.toThrow()
      expect(() => container.expectCalledWith(TOKEN, 'doWork', [5])).not.toThrow()
    })

    it('should track call count', async () => {
      const TOKEN = InjectionToken.create<{ process(): void }>('process-token')

      class MockProcessor {
        process(): void {}
      }

      container.bind(TOKEN).toClass(MockProcessor)
      const processor = await container.get(TOKEN)

      processor.process()
      container.recordMethodCall(TOKEN, 'process', [])
      processor.process()
      container.recordMethodCall(TOKEN, 'process', [])
      processor.process()
      container.recordMethodCall(TOKEN, 'process', [])

      expect(() => container.expectCallCount(TOKEN, 'process', 3)).not.toThrow()
    })

    it('should get all method calls', async () => {
      const TOKEN = InjectionToken.create<{ action(s: string): void }>('action-token')

      class MockAction {
        // oxlint-disable-next-line no-unused-vars
        action(s: string): void {}
      }

      container.bind(TOKEN).toClass(MockAction)
      const action = await container.get(TOKEN)

      action.action('first')
      container.recordMethodCall(TOKEN, 'action', ['first'])
      action.action('second')
      container.recordMethodCall(TOKEN, 'action', ['second'])

      const calls = container.getMethodCalls(TOKEN)
      expect(calls).toHaveLength(2)
      expect(calls[0].args).toEqual(['first'])
      expect(calls[1].args).toEqual(['second'])
    })

    it('should clear method calls', async () => {
      const TOKEN = InjectionToken.create<{ foo(): void }>('foo-token')

      class MockFoo {
        foo(): void {}
      }

      container.bind(TOKEN).toClass(MockFoo)
      await container.get(TOKEN)
      container.recordMethodCall(TOKEN, 'foo', [])

      container.clearMethodCalls()

      expect(container.getMethodCalls(TOKEN)).toHaveLength(0)
    })
  })

  describe('Lifecycle Tracking', () => {
    it('should track lifecycle events for value bindings', async () => {
      const TOKEN = InjectionToken.create<object>('lifecycle-token')

      // Value bindings record 'created' event automatically
      container.bind(TOKEN).toValue({ name: 'test' })

      const stats = container.getServiceStats(TOKEN)
      expect(stats.lifecycleEvents.some((e) => e.event === 'created')).toBe(true)
    })

    it('should get service stats with method calls', async () => {
      const TOKEN = InjectionToken.create<{ method(): void }>('stats-token')

      const mockService = { method: () => {} }
      container.bind(TOKEN).toValue(mockService)

      const service = await container.get(TOKEN)
      service.method()
      container.recordMethodCall(TOKEN, 'method', [])

      const stats = container.getServiceStats(TOKEN)
      expect(stats.instanceCount).toBe(1)
      expect(stats.methodCalls).toHaveLength(1)
    })
  })

  describe('Dependency Graph', () => {
    it('should get dependency graph', async () => {
      const TOKEN_A = InjectionToken.create<object>('service-a')
      const TOKEN_B = InjectionToken.create<object>('service-b')

      container.bind(TOKEN_A).toValue({ name: 'A' })
      container.bind(TOKEN_B).toValue({ name: 'B' })

      await container.get(TOKEN_A)
      await container.get(TOKEN_B)

      const graph = container.getDependencyGraph()
      expect(graph.nodes).toBeDefined()
      expect(Object.keys(graph.nodes).length).toBeGreaterThan(0)
    })

    it('should get simplified dependency graph', async () => {
      const TOKEN = InjectionToken.create<object>('independent-service')

      container.bind(TOKEN).toValue({ independent: true })
      await container.get(TOKEN)

      const graph = container.getSimplifiedDependencyGraph()
      expect(graph).toBeDefined()
      expect(typeof graph).toBe('object')
    })
  })
})
