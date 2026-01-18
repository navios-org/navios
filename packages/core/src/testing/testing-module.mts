import { TestContainer } from '@navios/di/testing'

import type { ClassType, ClassTypeWithInstance, InjectionToken, ScopedContainer } from '@navios/di'

import { NaviosApplication } from '../navios.application.mjs'
import { NaviosFactory } from '../navios.factory.mjs'

import type { NaviosModule } from '../interfaces/index.mjs'
import type { NaviosApplicationOptions } from '../navios.application.mjs'

/**
 * Configuration for overriding a provider in the testing module.
 *
 * @typeParam T - The type of the provider being overridden
 */
export interface TestingModuleOverride<T = any> {
  /**
   * The injection token or class to override.
   */
  token: ClassType | InjectionToken<T, any>
  /**
   * Value to use instead of the original provider.
   */
  useValue?: T
  /**
   * Class to use instead of the original provider.
   */
  useClass?: ClassType
}

/**
 * Options for creating a testing module.
 *
 * Extends NaviosApplicationOptions but excludes the container option,
 * as TestingModule manages its own TestContainer.
 */
export interface TestingModuleOptions extends Omit<NaviosApplicationOptions, 'container'> {
  /**
   * Initial provider overrides to apply when creating the testing module.
   *
   * You can also use `overrideProvider()` method for a fluent API.
   */
  overrides?: TestingModuleOverride[]
  /**
   * Container to use for the testing module.
   * If not provided, a new TestContainer will be created.
   */
  container?: TestContainer
}

/**
 * A testing-optimized wrapper around NaviosApplication.
 * Provides utilities for setting up test environments with mock dependencies.
 *
 * When `init()` is called, a request scope is automatically started.
 * This means `get()` calls will resolve request-scoped services correctly,
 * simulating a real HTTP request context.
 *
 * @example
 * ```typescript
 * const module = await TestingModule.create(AppModule)
 *   .overrideProvider(DatabaseService)
 *   .useValue(mockDatabase)
 *   .init()
 *
 * const userService = await module.get(UserService)
 * // ... run tests ...
 *
 * await module.close()
 * ```
 */
export class TestingModule {
  private app: NaviosApplication | null = null
  private scopedContainer: ScopedContainer | null = null
  private requestId = `test-request-${Date.now()}-${Math.random().toString(36).slice(2)}`

  private constructor(
    private readonly appModule: ClassTypeWithInstance<NaviosModule>,
    private readonly container: TestContainer,
    private readonly options: TestingModuleOptions,
  ) {}

  /**
   * Creates a new TestingModule for the given app module.
   * This is the main entry point for setting up integration tests.
   *
   * @example
   * ```typescript
   * const module = await TestingModule.create(AppModule)
   *   .overrideProvider(DatabaseService)
   *   .useValue(mockDatabase)
   *   .init()
   * ```
   */
  static create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: TestingModuleOptions = { adapter: [] },
  ): TestingModule {
    const container =
      options.container ??
      new TestContainer({
        parentRegistry: options.registry,
      })

    // Apply initial overrides if provided
    if (options.overrides) {
      for (const override of options.overrides) {
        if (override.useValue !== undefined) {
          container.bind(override.token as any).toValue(override.useValue)
        } else if (override.useClass) {
          container.bind(override.token as any).toClass(override.useClass)
        }
      }
    }

    return new TestingModule(appModule, container, options)
  }

  /**
   * Compiles the testing module without initializing it.
   * Call this if you need to access the app before initialization.
   *
   * @returns this for chaining
   */
  async compile(): Promise<this> {
    if (!this.app) {
      this.app = await NaviosFactory.create(this.appModule, {
        ...this.options,
        container: this.container,
      })
    }
    return this
  }

  /**
   * Initializes the application and starts a request scope.
   *
   * This is equivalent to calling `compile()` followed by `app.init()`,
   * plus starting a request context for proper request-scoped service resolution.
   *
   * @returns this for chaining
   */
  async init(): Promise<this> {
    if (!this.app) {
      await this.compile()
    }
    await this.app!.init()

    // Begin a request scope so get() can resolve request-scoped services
    this.scopedContainer = this.container.beginRequest(this.requestId, {
      testingModule: true,
    })

    return this
  }

  /**
   * Gets the compiled application.
   *
   * @throws Error if the module has not been compiled yet
   */
  getApp(): NaviosApplication {
    if (!this.app) {
      throw new Error('TestingModule not compiled. Call compile() or init() first.')
    }
    return this.app
  }

  /**
   * Gets the underlying TestContainer for direct manipulation.
   */
  getContainer(): TestContainer {
    return this.container
  }

  /**
   * Gets the scoped container for the current test request.
   * Only available after calling `init()`.
   *
   * @throws Error if init() has not been called
   */
  getScopedContainer(): ScopedContainer {
    if (!this.scopedContainer) {
      throw new Error('No scoped container available. Call init() first.')
    }
    return this.scopedContainer
  }

  /**
   * Override a provider with a mock value or class.
   * Must be called before `compile()` or `init()`.
   */
  overrideProvider<T>(token: ClassType | InjectionToken<T, any>): {
    useValue: (value: T) => TestingModule
    useClass: (target: ClassType) => TestingModule
  } {
    return {
      useValue: (value: T) => {
        this.container.bind(token as any).toValue(value)
        return this
      },
      useClass: (target: ClassType) => {
        this.container.bind(token as any).toClass(target)
        return this
      },
    }
  }

  /**
   * Gets an instance from the container.
   *
   * If `init()` has been called, this uses the scoped container
   * which properly resolves request-scoped services.
   *
   * If only `compile()` was called, this uses the root container
   * and request-scoped services will throw.
   */
  async get<T>(token: ClassTypeWithInstance<T> | InjectionToken<T, any>): Promise<T> {
    // Use scoped container if available (after init)
    if (this.scopedContainer) {
      return this.scopedContainer.get(token as any)
    }
    // Fall back to root container (after compile only)
    return this.container.get(token as any)
  }

  /**
   * Disposes the testing module and cleans up all resources.
   *
   * This will:
   * 1. End the request scope (if started)
   * 2. Close the application (if initialized)
   * 3. Dispose the container
   */
  async close(): Promise<void> {
    // End the request scope first
    if (this.scopedContainer) {
      await this.scopedContainer.endRequest()
      this.scopedContainer = null
    }

    // Close the app
    if (this.app) {
      await this.app.close()
      this.app = null
    }

    // Dispose the container
    await this.container.dispose()
  }

  // ===========================================================================
  // ASSERTION HELPERS (delegated to TestContainer)
  // ===========================================================================

  /**
   * Asserts that a service has been resolved at least once.
   */
  expectResolved(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectResolved(token)
  }

  /**
   * Asserts that a service has NOT been resolved.
   */
  expectNotResolved(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectNotResolved(token)
  }

  /**
   * Asserts that a service is registered as singleton scope.
   */
  expectSingleton(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectSingleton(token)
  }

  /**
   * Asserts that a service is registered as transient scope.
   */
  expectTransient(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectTransient(token)
  }

  /**
   * Asserts that a service is registered as request scope.
   */
  expectRequestScoped(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectRequestScoped(token)
  }

  /**
   * Asserts that a method was called on a service.
   * Note: You must use `recordMethodCall()` in your mocks for this to work.
   */
  expectCalled(token: ClassType | InjectionToken<any, any>, method: string): void {
    this.container.expectCalled(token, method)
  }

  /**
   * Asserts that a method was called with specific arguments.
   * Note: You must use `recordMethodCall()` in your mocks for this to work.
   */
  expectCalledWith(
    token: ClassType | InjectionToken<any, any>,
    method: string,
    expectedArgs: unknown[],
  ): void {
    this.container.expectCalledWith(token, method, expectedArgs)
  }

  /**
   * Asserts that a method was called a specific number of times.
   * Note: You must use `recordMethodCall()` in your mocks for this to work.
   */
  expectCallCount(
    token: ClassType | InjectionToken<any, any>,
    method: string,
    count: number,
  ): void {
    this.container.expectCallCount(token, method, count)
  }

  /**
   * Records a method call for tracking.
   * Call this from your mock implementations to enable call assertions.
   */
  recordMethodCall(
    token: ClassType | InjectionToken<any, any>,
    method: string,
    args: unknown[],
    result?: unknown,
    error?: Error,
  ): void {
    this.container.recordMethodCall(token, method, args, result, error)
  }

  /**
   * Gets all recorded method calls for a service.
   */
  getMethodCalls(token: ClassType | InjectionToken<any, any>) {
    return this.container.getMethodCalls(token)
  }

  /**
   * Gets the dependency graph for debugging or snapshot testing.
   */
  getDependencyGraph() {
    return this.container.getDependencyGraph()
  }

  /**
   * Gets a simplified dependency graph showing only token relationships.
   */
  getSimplifiedDependencyGraph() {
    return this.container.getSimplifiedDependencyGraph()
  }
}

/**
 * Creates a testing module for the given app module.
 *
 * @deprecated Use `TestingModule.create()` instead.
 *
 * @example
 * ```typescript
 * // Old way (deprecated)
 * const module = createTestingModule(AppModule)
 *
 * // New way
 * const module = TestingModule.create(AppModule)
 * ```
 */
export function createTestingModule(
  appModule: ClassTypeWithInstance<NaviosModule>,
  options: TestingModuleOptions = { adapter: [] },
): TestingModule {
  return TestingModule.create(appModule, options)
}
