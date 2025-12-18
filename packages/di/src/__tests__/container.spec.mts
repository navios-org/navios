// oxlint-disable no-unused-vars
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type {
  Factorable,
  FactorableWithArgs,
} from '../interfaces/factory.interface.mjs'
import type { FactoryContext } from '../internal/context/factory-context.mjs'

import { Container } from '../container/container.mjs'
import { Factory } from '../decorators/factory.decorator.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/injectable-scope.enum.mjs'
import { getInjectors } from '../index.mjs'
import { asyncInject, inject } from '../injectors.mjs'
import { ServiceLocator } from '../internal/core/service-locator.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { Registry } from '../token/registry.mjs'

describe('Container', () => {
  let container: Container
  let registry: Registry
  let mockLogger: Console

  beforeEach(() => {
    registry = new Registry()
    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as any
    container = new Container(registry, mockLogger)
  })

  describe('Basic functionality', () => {
    it('should create container with default registry', () => {
      const defaultContainer = new Container()
      expect(defaultContainer).toBeInstanceOf(Container)
    })

    it('should create container with custom registry and logger', () => {
      expect(container).toBeInstanceOf(Container)
      expect(container.getServiceLocator()).toBeInstanceOf(ServiceLocator)
    })

    it('should register itself in the container', async () => {
      const selfInstance = await container.get(Container)
      expect(selfInstance).toBe(container)
    })

    it('should return the same ServiceLocator instance', () => {
      const serviceLocator1 = container.getServiceLocator()
      const serviceLocator2 = container.getServiceLocator()
      expect(serviceLocator1).toBe(serviceLocator2)
    })
  })

  describe('Injectable decorator scenarios', () => {
    describe('Singleton scope', () => {
      it('should return the same instance for singleton services', async () => {
        @Injectable({ registry })
        class TestService {
          public id = Math.random()
        }

        const instance1 = await container.get(TestService)
        const instance2 = await container.get(TestService)

        expect(instance1).toBeInstanceOf(TestService)
        expect(instance2).toBeInstanceOf(TestService)
        expect(instance1).toBe(instance2)
        expect(instance1.id).toBe(instance2.id)
      })

      it('should work with default singleton scope', async () => {
        @Injectable({ registry })
        class TestService {
          public id = Math.random()
        }

        const instance1 = await container.get(TestService)
        const instance2 = await container.get(TestService)

        expect(instance1).toBe(instance2)
      })
    })

    describe('Transient scope', () => {
      it('should return different instances for transient services', async () => {
        @Injectable({ registry, scope: InjectableScope.Transient })
        class TestService {
          public id = Math.random()
        }

        const instance1 = await container.get(TestService)
        const instance2 = await container.get(TestService)

        expect(instance1).toBeInstanceOf(TestService)
        expect(instance2).toBeInstanceOf(TestService)
        expect(instance1).not.toBe(instance2)
        expect(instance1.id).not.toBe(instance2.id)
      })
    })

    describe('Custom injection tokens', () => {
      it('should work with string tokens', async () => {
        const token = InjectionToken.create<TestService>('TestService')

        @Injectable({ token, registry })
        class TestService {
          public value = 'test'
        }

        const instance = await container.get(token)
        expect(instance).toBeInstanceOf(TestService)
        expect(instance.value).toBe('test')
      })

      it('should work with symbol tokens', async () => {
        const token = InjectionToken.create<TestService>(Symbol('TestService'))

        @Injectable({ token, registry })
        class TestService {
          public value = 'test'
        }

        const instance = await container.get(token)
        expect(instance).toBeInstanceOf(TestService)
        expect(instance.value).toBe('test')
      })

      it('should work with custom registry', async () => {
        const customRegistry = new Registry()
        const customContainer = new Container(customRegistry, mockLogger)
        const token = InjectionToken.create<CustomService>('CustomService')

        @Injectable({ token, registry: customRegistry })
        class CustomService {
          public value = 'custom'
        }

        const instance = await customContainer.get(token)
        expect(instance).toBeInstanceOf(CustomService)
        expect(instance.value).toBe('custom')
      })
    })

    describe('Constructor arguments with schemas', () => {
      it('should work with required schema arguments', async () => {
        const schema = z.object({
          name: z.string(),
          age: z.number(),
        })
        const token = InjectionToken.create<UserService, typeof schema>(
          'UserService',
          schema,
        )

        @Injectable({ token, registry })
        class UserService {
          constructor(public readonly config: z.output<typeof schema>) {}
        }

        const config = { name: 'John', age: 30 }
        const instance = await container.get(token, config)

        expect(instance).toBeInstanceOf(UserService)
        expect(instance.config).toEqual(config)
      })

      it('should work with optional schema arguments', async () => {
        const schema = z
          .object({
            name: z.string(),
            age: z.number().optional(),
          })
          .optional()
        const token = InjectionToken.create<OptionalService, typeof schema>(
          'OptionalService',
          schema,
        )

        @Injectable({ token, registry })
        class OptionalService {
          constructor(public readonly config?: z.output<typeof schema>) {}
        }

        // Test with arguments
        const config = { name: 'John', age: 30 }
        const instance1 = await container.get(token, config)
        expect(instance1).toBeInstanceOf(OptionalService)
        expect(instance1.config).toEqual(config)

        // Test without arguments
        const instance2 = await container.get(token)
        expect(instance2).toBeInstanceOf(OptionalService)
        expect(instance2.config).toBeUndefined()
      })

      it('should work with complex nested schemas', async () => {
        const schema = z.object({
          user: z.object({
            name: z.string(),
            preferences: z.object({
              theme: z.enum(['light', 'dark']),
              notifications: z.boolean(),
            }),
          }),
          settings: z.array(z.string()),
        })
        const token = InjectionToken.create<ComplexService, typeof schema>(
          'ComplexService',
          schema,
        )

        @Injectable({ token, registry })
        class ComplexService {
          constructor(public readonly config: z.output<typeof schema>) {}
        }

        const config = {
          user: {
            name: 'Alice',
            preferences: {
              theme: 'dark' as const,
              notifications: true,
            },
          },
          settings: ['setting1', 'setting2'],
        }

        const instance = await container.get(token, config)
        expect(instance).toBeInstanceOf(ComplexService)
        expect(instance.config).toEqual(config)
      })
    })
  })

  describe('Factory decorator scenarios', () => {
    describe('Basic factory', () => {
      it('should work with simple factory', async () => {
        @Factory({ registry })
        class TestFactory implements Factorable<TestService> {
          async create() {
            return new TestService()
          }
        }

        @Injectable({ registry })
        class TestService {
          public value = 'created by factory'
        }

        const instance = await container.get(TestFactory)
        expect(instance).toBeInstanceOf(TestService)
        expect(instance.value).toBe('created by factory')
      })

      it('should work with factory returning different instances', async () => {
        @Factory({ scope: InjectableScope.Transient, registry })
        class TestFactory implements Factorable<TestService> {
          async create() {
            return new TestService()
          }
        }

        @Injectable({ registry })
        class TestService {
          public id = Math.random()
        }

        const instance1 = await container.get(TestFactory)
        const instance2 = await container.get(TestFactory)

        expect(instance1).toBeInstanceOf(TestService)
        expect(instance2).toBeInstanceOf(TestService)
        expect(instance1.id).not.toBe(instance2.id)
      })

      it('should work with factory using context', async () => {
        @Factory({ registry })
        class ContextFactory implements Factorable<TestService> {
          async create(ctx: FactoryContext) {
            const container = await ctx.inject(Container)
            return new TestService(container)
          }
        }

        @Injectable({ registry })
        class TestService {
          constructor(public readonly container?: Container) {}
        }

        const instance = await container.get(ContextFactory)
        expect(instance).toBeInstanceOf(TestService)
        expect(instance.container).toBe(container)
      })
    })

    describe('Factory with arguments', () => {
      it('should work with factory requiring arguments', async () => {
        const schema = z.object({
          name: z.string(),
          value: z.number(),
        })
        const token = InjectionToken.create<TestService, typeof schema>(
          'ArgFactory',
          schema,
        )

        @Factory({ token, registry })
        // oxlint-disable-next-line no-unused-vars
        class ArgFactory implements FactorableWithArgs<
          TestService,
          typeof schema
        > {
          async create(ctx: any, args: z.output<typeof schema>) {
            return new TestService(args.name, args.value)
          }
        }

        class TestService {
          constructor(
            public readonly name: string,
            public readonly value: number,
          ) {}
        }

        const args = { name: 'Test', value: 42 }
        const instance = await container.get(token, args)

        expect(instance).toBeInstanceOf(TestService)
        expect(instance.name).toBe('Test')
        expect(instance.value).toBe(42)
      })

      it('should work with factory and optional arguments', async () => {
        const schema = z
          .object({
            name: z.string(),
            optional: z.string().optional(),
          })
          .optional()
        const token = InjectionToken.create<TestService, typeof schema>(
          'OptionalArgFactory',
          schema,
        )

        @Factory({ token, registry })
        // oxlint-disable-next-line no-unused-vars
        class OptionalArgFactory implements FactorableWithArgs<
          TestService,
          typeof schema
        > {
          async create(ctx: any, args: z.output<typeof schema>) {
            return new TestService(args?.name || 'default', args?.optional)
          }
        }

        class TestService {
          constructor(
            public readonly name: string,
            public readonly optional?: string,
          ) {}
        }

        // Test with arguments
        const args = { name: 'Test', optional: 'value' }
        const instance1 = await container.get(token, args)
        expect(instance1.name).toBe('Test')
        expect(instance1.optional).toBe('value')

        // Test without arguments
        const instance2 = await container.get(token)
        expect(instance2.name).toBe('default')
        expect(instance2.optional).toBeUndefined()
      })
    })

    describe('Factory with custom tokens', () => {
      it('should work with factory using custom token', async () => {
        const token = InjectionToken.create<TestService>(
          Symbol('CustomFactory'),
        )

        @Factory({ token, registry })
        // oxlint-disable-next-line no-unused-vars
        class CustomFactory implements Factorable<TestService> {
          async create() {
            return new TestService('custom')
          }
        }

        class TestService {
          constructor(public readonly type: string) {}
        }

        const instance = await container.get(token)
        expect(instance).toBeInstanceOf(TestService)
        expect(instance.type).toBe('custom')
      })
    })
  })

  describe('Injection token types', () => {
    describe('Bound injection tokens', () => {
      it('should work with bound tokens', async () => {
        const schema = z.object({
          config: z.string(),
        })
        const token = InjectionToken.create<ConfigService, typeof schema>(
          'ConfigService',
          schema,
        )

        @Injectable({ token, registry })
        class ConfigService {
          constructor(public readonly config: z.output<typeof schema>) {}
        }

        const boundToken = InjectionToken.bound(token, {
          config: 'bound-value',
        })
        const instance = await container.get(boundToken)

        expect(instance).toBeInstanceOf(ConfigService)
        expect(instance.config).toEqual({ config: 'bound-value' })
      })

      it('should work with bound tokens and factories', async () => {
        const schema = z.object({
          factory: z.string(),
        })
        const token = InjectionToken.create<TestService, typeof schema>(
          'FactoryService',
          schema,
        )

        @Factory({ token, registry })
        // oxlint-disable-next-line no-unused-vars
        class FactoryService implements FactorableWithArgs<
          TestService,
          typeof schema
        > {
          async create(ctx: any, args: z.output<typeof schema>) {
            return new TestService(args.factory)
          }
        }

        class TestService {
          constructor(public readonly factory: string) {}
        }

        const boundToken = InjectionToken.bound(token, {
          factory: 'bound-factory',
        })
        const instance = await container.get(boundToken)

        expect(instance).toBeInstanceOf(TestService)
        expect(instance.factory).toBe('bound-factory')
      })
    })

    describe('Factory injection tokens', () => {
      it('should work with factory injection tokens', async () => {
        const schema = z.object({
          data: z.string(),
        })
        const token = InjectionToken.create<DataService, typeof schema>(
          'DataService',
          schema,
        )

        @Injectable({ token, registry })
        class DataService {
          constructor(public readonly data: z.output<typeof schema>) {}
        }

        const factoryToken = InjectionToken.factory(token, async () => ({
          data: 'factory-generated',
        }))

        const instance = await container.get(factoryToken)
        expect(instance).toBeInstanceOf(DataService)
        expect(instance.data).toEqual({ data: 'factory-generated' })
      })

      it('should resolve factory tokens only once', async () => {
        const schema = z.object({
          counter: z.number(),
        })
        const token = InjectionToken.create<CounterService, typeof schema>(
          'CounterService',
          schema,
        )

        @Injectable({ token, registry })
        class CounterService {
          constructor(public readonly counter: z.output<typeof schema>) {}
        }

        let callCount = 0
        const factoryToken = InjectionToken.factory(token, async () => {
          callCount++
          return { counter: callCount }
        })

        const instance1 = await container.get(factoryToken)
        const instance2 = await container.get(factoryToken)

        expect(instance1).toBeInstanceOf(CounterService)
        expect(instance2).toBeInstanceOf(CounterService)
        expect(callCount).toBe(1) // Factory should only be called once
        expect(instance1.counter).toEqual({ counter: 1 })
        expect(instance2.counter).toEqual({ counter: 1 })
      })
    })
  })

  describe('Complex dependency injection scenarios', () => {
    it('should handle circular dependencies gracefully', async () => {
      @Injectable({ registry })
      class ServiceA {
        serviceB = asyncInject(ServiceB)
      }

      @Injectable({ registry })
      class ServiceB {
        serviceA = asyncInject(ServiceA).catch(() => null)
      }

      // This should not throw but handle the circular dependency
      const serviceA = await container.get(ServiceA)
      expect(serviceA).toBeInstanceOf(ServiceA)
      expect(serviceA.serviceB).toBeInstanceOf(Promise)
      const serviceB = await serviceA.serviceB
      expect(serviceB).toBeInstanceOf(ServiceB)
      const serviceA2 = await serviceB.serviceA
      expect(serviceA2).toBeInstanceOf(ServiceA)
    })

    it('should handle deep dependency chains', async () => {
      @Injectable({ registry })
      class Level1 {
        public value = 'level1'
      }

      @Injectable({ registry })
      class Level2 {
        level1 = inject(Level1)
      }

      @Injectable({ registry })
      class Level3 {
        level2 = inject(Level2)
      }

      @Injectable({ registry })
      class Level4 {
        level3 = inject(Level3)
      }

      const level4 = await container.get(Level4)
      expect(level4).toBeInstanceOf(Level4)

      const level3 = await level4.level3
      expect(level3).toBeInstanceOf(Level3)

      const level2 = await level3.level2
      expect(level2).toBeInstanceOf(Level2)

      const level1 = await level2.level1
      expect(level1).toBeInstanceOf(Level1)
      expect(level1.value).toBe('level1')
    })

    it('should handle async factory dependencies', async () => {
      @Injectable({ registry })
      class DatabaseService {
        public async connect() {
          return 'connected'
        }
      }

      @Factory({ registry })
      class DatabaseFactory implements Factorable<DatabaseService> {
        async create() {
          const db = new DatabaseService()
          await db.connect()
          return db
        }
      }

      @Injectable({ registry })
      class AppService {
        database = asyncInject(DatabaseFactory)
      }

      const app = await container.get(AppService)
      const database = await app.database
      expect(database).toBeInstanceOf(DatabaseService)
    })
  })

  describe('Error handling and edge cases', () => {
    it('should throw error for unregistered service', async () => {
      class UnregisteredService {}

      await expect(container.get(UnregisteredService)).rejects.toThrow()
    })

    it('should throw error for invalid arguments', async () => {
      const schema = z.object({
        required: z.string(),
      })
      const token = InjectionToken.create<RequiredService, typeof schema>(
        'RequiredService',
        schema,
      )

      @Injectable({ token, registry })
      class RequiredService {
        constructor(public readonly config: z.output<typeof schema>) {}
      }

      await expect(container.get(token)).rejects.toThrow()
      // @ts-expect-error This is a test
      await expect(container.get(token, { invalid: 'arg' })).rejects.toThrow()
    })

    it.skip('should handle factory errors', async () => {
      @Factory({ registry })
      class ErrorFactory implements Factorable<TestService> {
        async create() {
          throw new Error('Factory error')
        }
      }

      @Injectable({ registry })
      class TestService {}

      await expect(container.get(ErrorFactory)).rejects.toThrow('Factory error')
    })

    it.skip('should handle async factory errors', async () => {
      @Factory({ registry })
      class AsyncErrorFactory implements Factorable<TestService> {
        async create() {
          await new Promise((resolve) => setTimeout(resolve, 10))
          throw new Error('Async factory error')
        }
      }

      @Injectable({ registry })
      class TestService {}

      await expect(container.get(AsyncErrorFactory)).rejects.toThrow(
        'Async factory error',
      )
    })

    it('should handle invalid schema validation', async () => {
      const schema = z.object({
        email: z.string().email(),
      })
      const token = InjectionToken.create<EmailService, typeof schema>(
        'EmailService',
        schema,
      )

      @Injectable({ token, registry })
      class EmailService {
        constructor(public readonly config: z.output<typeof schema>) {}
      }

      await expect(
        container.get(token, { email: 'invalid-email' }),
      ).rejects.toThrow()
    })
  })

  describe('Service invalidation', () => {
    it('should invalidate singleton services', async () => {
      @Injectable({ registry })
      class TestService {
        public id = Math.random()
      }

      const instance1 = await container.get(TestService)
      await container.invalidate(instance1)

      const instance2 = await container.get(TestService)
      expect(instance1).not.toBe(instance2)
      expect(instance1.id).not.toBe(instance2.id)
    })

    it('should invalidate services with dependencies', async () => {
      @Injectable({ registry, scope: InjectableScope.Transient })
      class DependencyService {
        public id = Math.random()
      }

      @Injectable({ registry })
      class MainService {
        dependency = asyncInject(DependencyService)
        public id = Math.random()
      }

      const main1 = await container.get(MainService)
      const dep1 = await main1.dependency

      await container.invalidate(main1)

      const main2 = await container.get(MainService)
      const dep2 = await main2.dependency

      expect(main1).not.toBe(main2)
      expect(dep1).not.toBe(dep2)
    })

    it('should handle invalidation of non-existent service', async () => {
      const fakeService = { id: 'fake' }

      // Should not throw
      await expect(container.invalidate(fakeService)).resolves.toBeUndefined()
    })

    it('should invalidate factory services', async () => {
      @Factory({ scope: InjectableScope.Singleton, registry })
      class TestFactory implements Factorable<TestService> {
        async create() {
          return new TestService()
        }
      }

      @Injectable({ registry })
      class TestService {
        public id = Math.random()
      }

      const instance1 = await container.get(TestFactory)
      await container.invalidate(instance1)

      const instance2 = await container.get(TestFactory)
      expect(instance1).not.toBe(instance2)
      expect(instance1.id).not.toBe(instance2.id)
    })
  })

  describe('Ready method and async operations', () => {
    it('should wait for all pending operations', async () => {
      const deferred = Promise.withResolvers<string>()

      @Factory({ registry })
      class AsyncFactory implements Factorable<TestService> {
        async create() {
          const result = await deferred.promise
          return new TestService(result)
        }
      }

      class TestService {
        constructor(public readonly value: string) {}
      }

      const promise = container.get(AsyncFactory)

      // Should not be ready yet
      await expect(container.ready()).resolves.toBeUndefined()

      // Resolve the deferred
      deferred.resolve('async-result')

      const instance = await promise
      expect(instance.value).toBe('async-result')
    })

    it('should handle multiple concurrent operations', async () => {
      const deferred1 = Promise.withResolvers<string>()
      const deferred2 = Promise.withResolvers<string>()

      @Factory({ registry })
      class AsyncFactory1 implements Factorable<TestService> {
        async create() {
          const result = await deferred1.promise
          return new TestService(result)
        }
      }

      @Factory({ registry })
      class AsyncFactory2 implements Factorable<TestService> {
        async create() {
          const result = await deferred2.promise
          return new TestService(result)
        }
      }

      class TestService {
        constructor(public readonly value: string) {}
      }

      const promise1 = container.get(AsyncFactory1)
      const promise2 = container.get(AsyncFactory2)

      // Resolve both
      deferred1.resolve('result1')
      deferred2.resolve('result2')

      const [instance1, instance2] = await Promise.all([promise1, promise2])

      expect(instance1.value).toBe('result1')
      expect(instance2.value).toBe('result2')
    })

    it.skip('should handle factory errors in ready state', async () => {
      const deferred = Promise.withResolvers<string>()

      @Factory({ registry })
      class ErrorFactory implements Factorable<TestService> {
        async create() {
          const result = await deferred.promise
          if (result === 'error') {
            throw new Error('Factory error')
          }
          return new TestService()
        }
      }

      @Injectable({ registry })
      class TestService {
        constructor() {}
      }

      const promise = container.get(ErrorFactory)

      // Reject the deferred
      deferred.reject(new Error('Deferred error'))

      await expect(promise).rejects.toThrow('Deferred error')
    })
  })

  describe('Type safety and overloads', () => {
    it('should work with class type overload', async () => {
      @Injectable({ registry })
      class TestService {
        public value = 'test'
      }

      const instance = await container.get(TestService)
      expect(instance).toBeInstanceOf(TestService)
      expect(instance.value).toBe('test')
    })

    it('should work with token with required schema overload', async () => {
      const schema = z.object({
        name: z.string(),
      })
      const token = InjectionToken.create<RequiredService, typeof schema>(
        'RequiredService',
        schema,
      )

      @Injectable({ token, registry })
      class RequiredService {
        constructor(public readonly config: z.output<typeof schema>) {}
      }

      const instance = await container.get(token, { name: 'test' })
      expect(instance).toBeInstanceOf(RequiredService)
      expect(instance.config.name).toBe('test')
    })

    it('should work with token with optional schema overload', async () => {
      const schema = z
        .object({
          name: z.string(),
        })
        .optional()
      const token = InjectionToken.create<OptionalService, typeof schema>(
        'OptionalService',
        schema,
      )

      @Injectable({ token, registry })
      class OptionalService {
        constructor(public readonly config?: z.output<typeof schema>) {}
      }

      const instance = await container.get(token)
      expect(instance).toBeInstanceOf(OptionalService)
      expect(instance.config).toBeUndefined()
    })

    it('should work with token with no schema overload', async () => {
      const token = InjectionToken.create<NoSchemaService>('NoSchemaService')

      @Injectable({ token, registry })
      class NoSchemaService {
        public value = 'no-schema'
      }

      const instance = await container.get(token)
      expect(instance).toBeInstanceOf(NoSchemaService)
      expect(instance.value).toBe('no-schema')
    })

    it('should work with bound injection token overload', async () => {
      const schema = z.object({
        value: z.string(),
      })
      const token = InjectionToken.create<BoundService, typeof schema>(
        'BoundService',
        schema,
      )

      @Injectable({ token, registry })
      class BoundService {
        constructor(public readonly config: z.output<typeof schema>) {}
      }

      const boundToken = InjectionToken.bound(token, { value: 'bound' })
      const instance = await container.get(boundToken)

      expect(instance).toBeInstanceOf(BoundService)
      expect(instance.config.value).toBe('bound')
    })

    it('should work with factory injection token overload', async () => {
      const schema = z.object({
        data: z.string(),
      })
      const token = InjectionToken.create<FactoryService, typeof schema>(
        'FactoryService',
        schema,
      )

      @Injectable({ token, registry })
      class FactoryService {
        constructor(public readonly config: z.output<typeof schema>) {}
      }

      const factoryToken = InjectionToken.factory(token, async () => ({
        data: 'factory-data',
      }))

      const instance = await container.get(factoryToken)
      expect(instance).toBeInstanceOf(FactoryService)
      expect(instance.config.data).toBe('factory-data')
    })
  })

  describe('Performance and memory', () => {
    it('should handle large number of services efficiently', async () => {
      const services: any[] = []

      // Create 100 services
      for (let i = 0; i < 100; i++) {
        @Injectable({ registry })
        class TestService {
          public id = i
        }
        services.push(TestService)
      }

      // Get all services
      const instances = await Promise.all(
        services.map((Service) => container.get(Service)),
      )

      expect(instances).toHaveLength(100)
      instances.forEach((instance, index) => {
        expect(instance.id).toBe(index)
      })
    })
  })

  describe('inject scenarios', () => {
    describe('Singleton scope with inject', () => {
      it('should return same instances for singleton services with inject', async () => {
        @Injectable({ registry })
        class SingletonService {
          public id = Math.random()
        }

        @Injectable({ registry })
        class ServiceWithSyncInject {
          singletonService = inject(SingletonService)
        }

        const instance1 = await container.get(ServiceWithSyncInject)
        const instance2 = await container.get(ServiceWithSyncInject)

        expect(instance1).toBeInstanceOf(ServiceWithSyncInject)
        expect(instance2).toBeInstanceOf(ServiceWithSyncInject)
        expect(instance1).toBe(instance2) // ServiceWithSyncInject is singleton

        // The singleton service should be the same instance
        expect(instance1.singletonService).toBeInstanceOf(SingletonService)
        expect(instance2.singletonService).toBeInstanceOf(SingletonService)
        expect(instance1.singletonService).toBe(instance2.singletonService)
        expect(instance1.singletonService.id).toBe(
          instance2.singletonService.id,
        )
      })

      it('should handle nested singleton services with inject', async () => {
        @Injectable({ registry })
        class Level1Singleton {
          public id = Math.random()
        }

        @Injectable({ registry })
        class Level2Singleton {
          level1 = inject(Level1Singleton)
          public id = Math.random()
        }

        @Injectable({ registry })
        class RootService {
          level2 = inject(Level2Singleton)
        }

        const root1 = await container.get(RootService)
        const root2 = await container.get(RootService)

        expect(root1).toBe(root2) // RootService is singleton

        // Level2 should be the same instances
        expect(root1.level2).toBe(root2.level2)
        expect(root1.level2.id).toBe(root2.level2.id)

        // Level1 should also be the same instances
        expect(root1.level2.level1).toBe(root2.level2.level1)
        expect(root1.level2.level1.id).toBe(root2.level2.level1.id)
      })

      it('should handle mixed singleton services with inject', async () => {
        @Injectable({ registry })
        class SingletonService1 {
          public id = Math.random()
        }

        @Injectable({ registry })
        class SingletonService2 {
          singleton1 = inject(SingletonService1)
          public id = Math.random()
        }

        @Injectable({ registry })
        class MixedService {
          singleton2 = inject(SingletonService2)
        }

        const mixed1 = await container.get(MixedService)
        const mixed2 = await container.get(MixedService)

        expect(mixed1).toBe(mixed2) // MixedService is singleton

        // SingletonService2 should be the same instances
        expect(mixed1.singleton2).toBe(mixed2.singleton2)
        expect(mixed1.singleton2.id).toBe(mixed2.singleton2.id)

        // SingletonService1 should also be the same instance
        expect(mixed1.singleton2.singleton1).toBe(mixed2.singleton2.singleton1)
        expect(mixed1.singleton2.singleton1.id).toBe(
          mixed2.singleton2.singleton1.id,
        )
      })
    })

    describe('inject with invalidation', () => {
      it('should invalidate singleton services accessed via inject', async () => {
        @Injectable({ registry })
        class SingletonService {
          public id = Math.random()
        }

        @Injectable({ registry })
        class ServiceWithSyncInject {
          singletonService = inject(SingletonService)
        }

        const instance1 = await container.get(ServiceWithSyncInject)
        const singleton1 = instance1.singletonService

        // Invalidate the singleton service
        await container.invalidate(singleton1)

        const instance2 = await container.get(ServiceWithSyncInject)
        const singleton2 = instance2.singletonService

        // Should get a new singleton instance
        expect(singleton1).not.toBe(singleton2)
        expect(singleton1.id).not.toBe(singleton2.id)
      })

      it('should invalidate services with nested inject dependencies', async () => {
        @Injectable({ registry })
        class Level1Service {
          public id = Math.random()
        }

        @Injectable({ registry })
        class Level2Service {
          level1 = inject(Level1Service)
          public id = Math.random()
        }

        @Injectable({ registry })
        class RootService {
          level2 = inject(Level2Service)
        }

        const root1 = await container.get(RootService)
        const level2_1 = root1.level2
        const level1_1 = level2_1.level1

        // Invalidate the root service
        await container.invalidate(level1_1)

        const root2 = await container.get(RootService)
        const level2_2 = root2.level2
        const level1_2 = level2_2.level1

        // All should be new instances
        expect(root1).not.toBe(root2)
        expect(level2_1).not.toBe(level2_2)
        expect(level1_1).not.toBe(level1_2)
        expect(level2_1.id).not.toBe(level2_2.id)
        expect(level1_1.id).not.toBe(level1_2.id)
      })

      it('should invalidate services with nested inject dependencies in request context', async () => {
        @Injectable({ registry, scope: InjectableScope.Request })
        class Level1Service {
          public id = Math.random()
        }

        @Injectable({ registry, scope: InjectableScope.Request })
        class Level2Service {
          level1 = inject(Level1Service)
          public id = Math.random()
        }

        @Injectable({ registry, scope: InjectableScope.Request })
        class RootService {
          level2 = inject(Level2Service)
        }

        const scoped = container.beginRequest('request-1')

        const root1 = await scoped.get(RootService)
        const level2_1 = root1.level2
        const level1_1 = level2_1.level1

        // Invalidate the root service
        await scoped.invalidate(level1_1)

        const root2 = await scoped.get(RootService)
        const level2_2 = root2.level2
        const level1_2 = level2_2.level1

        // All should be new instances
        expect(root1).not.toBe(root2)
        expect(level2_1).not.toBe(level2_2)
        expect(level1_1).not.toBe(level1_2)
        expect(level2_1.id).not.toBe(level2_2.id)
        expect(level1_1.id).not.toBe(level1_2.id)

        await scoped.endRequest()
      })

      it('should handle invalidation of services with mixed inject and asyncInject', async () => {
        @Injectable({ registry })
        class AsyncService {
          public id = Math.random()
        }

        @Injectable({ registry })
        class SyncService {
          public id = Math.random()
        }

        @Injectable({ registry })
        class MixedService {
          asyncService = asyncInject(AsyncService)
          syncService = inject(SyncService)
        }

        const mixed1 = await container.get(MixedService)
        const async1 = await mixed1.asyncService
        const sync1 = mixed1.syncService

        // Invalidate the mixed service
        await container.invalidate(mixed1)

        const mixed2 = await container.get(MixedService)
        const async2 = await mixed2.asyncService
        const sync2 = mixed2.syncService

        // All should be new instances
        expect(mixed1).not.toBe(mixed2)
        expect(async1).toBe(async2)
        expect(sync1).toBe(sync2)
      })

      it('should handle invalidation of factory services accessed via inject', async () => {
        @Injectable({ registry })
        class TestService {
          public id = Math.random()
        }

        @Factory({ registry })
        class TestFactory implements Factorable<TestService> {
          async create() {
            return new TestService()
          }
        }

        @Injectable({ registry })
        class ServiceWithSyncInject {
          factoryService = inject(TestFactory)
        }

        const instance1 = await container.get(ServiceWithSyncInject)
        const factory1 = instance1.factoryService

        // Invalidate the factory service
        await container.invalidate(factory1)

        const instance2 = await container.get(ServiceWithSyncInject)
        const factory2 = instance2.factoryService

        // Should get a new factory instance
        expect(factory1).not.toBe(factory2)
        expect(factory1.id).not.toBe(factory2.id)
      })

      it('should handle invalidation of services with complex dependency chains using inject', async () => {
        @Injectable({ registry })
        class DatabaseService {
          public id = Math.random()
          public async connect() {
            return 'connected'
          }
        }

        @Injectable({ registry })
        class CacheService {
          public id = Math.random()
        }

        @Injectable({ registry })
        class UserService {
          database = inject(DatabaseService)
          cache = inject(CacheService)
          public id = Math.random()
        }

        @Injectable({ registry })
        class AuthService {
          userService = inject(UserService)
          public id = Math.random()
        }

        @Injectable({ registry })
        class AppService {
          authService = inject(AuthService)
        }

        const app1 = await container.get(AppService)
        const auth1 = app1.authService
        const user1 = auth1.userService
        const db1 = user1.database
        const cache1 = user1.cache

        // Invalidate the user service
        await container.invalidate(user1)

        const app2 = await container.get(AppService)
        const auth2 = app2.authService
        const user2 = auth2.userService
        const db2 = user2.database
        const cache2 = user2.cache

        // User service should be new instance but its dependencies should be the same
        expect(user1).not.toBe(user2)
        expect(db1).toBe(db2)
        expect(cache1).toBe(cache2)
        expect(user1.id).not.toBe(user2.id)
        expect(db1.id).toBe(db2.id)
        expect(cache1.id).toBe(cache2.id)

        // Auth service should also be new since it depends on user service
        expect(auth1).not.toBe(auth2)
        expect(auth1.id).not.toBe(auth2.id)

        // App service should also be new since it depends on auth service
        expect(app1).not.toBe(app2)
      })
    })

    describe('inject error handling', () => {
      it('should handle unregistered services with inject', async () => {
        class UnregisteredService {}

        @Injectable({ registry })
        class ServiceWithUnregistered {
          unregistered = inject(UnregisteredService)
        }

        // This should throw during instantiation, not during get()
        await expect(container.get(ServiceWithUnregistered)).rejects.toThrow()
      })
    })
  })
  describe('custom injectors', () => {
    it('should work with custom injectors', async () => {
      const injectors = getInjectors()
      const container = new Container(registry, mockLogger, injectors)
      expect(container).toBeInstanceOf(Container)
      const { inject } = injectors
      @Injectable({ registry })
      class TestService {
        test = 'a'
      }
      @Injectable({ registry })
      class TestService2 {
        test = inject(TestService)
      }
      const instance = await container.get(TestService2)
      expect(instance).toBeInstanceOf(TestService2)
      expect(instance.test.test).toBe('a')
    })
  })
})
