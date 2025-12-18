import type { ClassType, ClassTypeWithInstance, InjectionToken } from '@navios/di'
import type { NaviosModule } from '../interfaces/index.mjs'
import type { NaviosApplicationOptions } from '../navios.application.mjs'

import { TestContainer } from '@navios/di/testing'

import { NaviosApplication } from '../navios.application.mjs'
import { NaviosFactory } from '../navios.factory.mjs'

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
export interface TestingModuleOptions
  extends Omit<NaviosApplicationOptions, 'container'> {
  /**
   * Initial provider overrides to apply when creating the testing module.
   * 
   * You can also use `overrideProvider()` method for a fluent API.
   */
  overrides?: TestingModuleOverride[]
}

/**
 * A testing-optimized wrapper around NaviosApplication.
 * Provides utilities for setting up test environments with mock dependencies.
 */
export class TestingModule {
  private app: NaviosApplication | null = null

  constructor(
    private readonly appModule: ClassTypeWithInstance<NaviosModule>,
    private readonly container: TestContainer,
    private readonly options: TestingModuleOptions,
  ) {}

  /**
   * Compiles the testing module and returns the NaviosApplication.
   * Call this after setting up all overrides.
   */
  async compile(): Promise<NaviosApplication> {
    this.app = await NaviosFactory.create(this.appModule, {
      ...this.options,
      container: this.container,
    })
    return this.app
  }

  /**
   * Initializes the application (loads modules, sets up HTTP if configured).
   * This is equivalent to calling app.init() on the compiled application.
   */
  async init(): Promise<NaviosApplication> {
    if (!this.app) {
      await this.compile()
    }
    await this.app!.init()
    return this.app!
  }

  /**
   * Gets the underlying TestContainer for direct manipulation.
   */
  getContainer(): TestContainer {
    return this.container
  }

  /**
   * Gets the compiled application. Throws if not yet compiled.
   */
  getApplication(): NaviosApplication {
    if (!this.app) {
      throw new Error(
        'TestingModule not compiled. Call compile() or init() first.',
      )
    }
    return this.app
  }

  /**
   * Override a provider with a mock value.
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
   */
  async get<T>(token: ClassTypeWithInstance<T> | InjectionToken<T, any>): Promise<T> {
    return this.container.get(token as any)
  }

  /**
   * Disposes the testing module and cleans up resources.
   */
  async close(): Promise<void> {
    if (this.app) {
      await this.app.close()
    }
    await this.container.dispose()
  }
}

/**
 * Fluent builder interface for TestingModule.
 * 
 * Provides a chainable API for configuring and using a testing module.
 */
export interface TestingModuleBuilder {
  /**
   * Override a provider with a mock value or class.
   * 
   * @param token - The injection token or class to override
   * @returns An object with `useValue` and `useClass` methods for chaining
   * 
   * @example
   * ```typescript
   * const testingModule = await createTestingModule(AppModule)
   *   .overrideProvider(DatabaseService)
   *   .useValue(mockDatabaseService)
   *   .compile()
   * ```
   */
  overrideProvider<T>(token: ClassType | InjectionToken<T, any>): {
    useValue: (value: T) => TestingModuleBuilder
    useClass: (target: ClassType) => TestingModuleBuilder
  }

  /**
   * Compiles the testing module and returns the NaviosApplication.
   * 
   * This creates the application instance but does not initialize it.
   * Call `init()` if you need the application to be fully initialized.
   */
  compile(): Promise<NaviosApplication>

  /**
   * Initializes the application (loads modules, sets up HTTP if configured).
   * 
   * This is equivalent to calling `compile()` followed by `app.init()`.
   */
  init(): Promise<NaviosApplication>

  /**
   * Gets the underlying TestContainer for direct manipulation.
   */
  getContainer(): TestContainer

  /**
   * Gets an instance from the container.
   * 
   * @typeParam T - The type of the instance to retrieve
   * @param token - The injection token or class
   * @returns The resolved instance
   */
  get<T>(token: ClassTypeWithInstance<T> | InjectionToken<T, any>): Promise<T>

  /**
   * Disposes the testing module and cleans up resources.
   */
  close(): Promise<void>
}

/**
 * Creates a testing module for the given app module.
 * This is the main entry point for setting up tests.
 *
 * @example
 * ```typescript
 * const testingModule = await createTestingModule(AppModule, {
 *   adapter: [],
 * })
 *   .overrideProvider(DatabaseService)
 *   .useValue(mockDatabaseService)
 *   .compile()
 * ```
 */
export function createTestingModule(
  appModule: ClassTypeWithInstance<NaviosModule>,
  options: TestingModuleOptions = { adapter: [] },
): TestingModule {
  const container = new TestContainer()

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
