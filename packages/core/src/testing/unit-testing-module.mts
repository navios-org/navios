import type {
  ClassType,
  ClassTypeWithInstance,
  InjectionToken,
} from '@navios/di'
import type {
  MethodCallRecord,
  MockServiceStats,
  ProviderConfig,
} from '@navios/di/testing'

import { UnitTestContainer } from '@navios/di/testing'

/**
 * Options for creating a UnitTestingModule.
 */
export interface UnitTestingModuleOptions {
  /**
   * List of providers to register. Only these services can be resolved.
   */
  providers: ProviderConfig[]

  /**
   * If true, unregistered dependencies will be auto-mocked instead of throwing.
   * Default: false (throws on unregistered dependencies)
   */
  allowUnregistered?: boolean

  /**
   * Logger for debugging.
   */
  logger?: Console | null

  /**
   * Container to use for the testing module.
   * If not provided, a new UnitTestContainer will be created.
   */
  container?: UnitTestContainer
}

/**
 * A lightweight testing module for isolated unit tests.
 *
 * Unlike `TestingModule`, this does NOT load Navios modules or create an application.
 * It uses `UnitTestContainer` which:
 * - Only allows explicitly provided services
 * - Automatically tracks all method calls via proxies
 * - Can auto-mock unregistered dependencies
 *
 * This is ideal for testing services in isolation without the overhead
 * of full module loading.
 *
 * @example
 * ```typescript
 * const module = UnitTestingModule.create({
 *   providers: [
 *     { token: UserService, useClass: UserService },
 *     { token: DatabaseService, useValue: mockDatabase },
 *   ],
 * })
 *
 * const userService = await module.get(UserService)
 * await userService.findUser('123')
 *
 * // Method calls are automatically tracked
 * module.expectCalled(UserService, 'findUser')
 * module.expectCalledWith(UserService, 'findUser', ['123'])
 *
 * await module.close()
 * ```
 */
export class UnitTestingModule {
  private constructor(private readonly container: UnitTestContainer) {}

  /**
   * Creates a new UnitTestingModule with the given providers.
   *
   * @example
   * ```typescript
   * const module = UnitTestingModule.create({
   *   providers: [
   *     { token: UserService, useClass: UserService },
   *     { token: ConfigToken, useValue: { apiUrl: 'test' } },
   *   ],
   * })
   * ```
   */
  static create(options: UnitTestingModuleOptions): UnitTestingModule {
    const container =
      options.container ??
      new UnitTestContainer({
        providers: options.providers,
        allowUnregistered: options.allowUnregistered,
        logger: options.logger,
      })

    return new UnitTestingModule(container)
  }

  /**
   * Gets the underlying UnitTestContainer for direct manipulation.
   */
  getContainer(): UnitTestContainer {
    return this.container
  }

  /**
   * Gets an instance from the container.
   *
   * All resolved instances are wrapped in tracking proxies,
   * so method calls are automatically recorded.
   *
   * @throws Error if the token is not in the providers list
   *         and `allowUnregistered` is false
   */
  async get<T>(
    token: ClassTypeWithInstance<T> | InjectionToken<T, any>,
  ): Promise<T> {
    return this.container.get(token as any)
  }

  /**
   * Disposes the module and cleans up all resources.
   */
  async close(): Promise<void> {
    await this.container.clear()
  }

  /**
   * Enables auto-mocking for unregistered dependencies.
   * Unregistered services will return a proxy that throws on method access.
   */
  enableAutoMocking(): this {
    this.container.enableAutoMocking()
    return this
  }

  /**
   * Disables auto-mocking (strict mode).
   * Unregistered dependencies will throw immediately on resolution.
   */
  disableAutoMocking(): this {
    this.container.disableAutoMocking()
    return this
  }

  // ===========================================================================
  // ASSERTION HELPERS (delegated to UnitTestContainer)
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
   * Asserts that a service was auto-mocked (not in providers list).
   */
  expectAutoMocked(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectAutoMocked(token)
  }

  /**
   * Asserts that a service was NOT auto-mocked (is in providers list).
   */
  expectNotAutoMocked(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectNotAutoMocked(token)
  }

  /**
   * Asserts that a method was called on a service.
   * Method calls are automatically tracked via proxy.
   */
  expectCalled(
    token: ClassType | InjectionToken<any, any>,
    method: string,
  ): void {
    this.container.expectCalled(token, method)
  }

  /**
   * Asserts that a method was NOT called on a service.
   */
  expectNotCalled(
    token: ClassType | InjectionToken<any, any>,
    method: string,
  ): void {
    this.container.expectNotCalled(token, method)
  }

  /**
   * Asserts that a method was called with specific arguments.
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
   */
  expectCallCount(
    token: ClassType | InjectionToken<any, any>,
    method: string,
    count: number,
  ): void {
    this.container.expectCallCount(token, method, count)
  }

  /**
   * Gets all recorded method calls for a service.
   */
  getMethodCalls(
    token: ClassType | InjectionToken<any, any>,
  ): MethodCallRecord[] {
    return this.container.getMethodCalls(token)
  }

  /**
   * Gets statistics about a service (instance count, method calls, lifecycle events).
   */
  getServiceStats(
    token: ClassType | InjectionToken<any, any>,
  ): MockServiceStats {
    return this.container.getServiceStats(token)
  }

  /**
   * Clears all recorded method calls.
   * Useful for resetting state between test assertions.
   */
  clearMethodCalls(): void {
    this.container.clearMethodCalls()
  }

  /**
   * Gets list of all registered provider token IDs.
   */
  getRegisteredTokenIds(): ReadonlySet<string> {
    return this.container.getRegisteredTokenIds()
  }

  /**
   * Gets list of all auto-mocked token IDs.
   */
  getAutoMockedTokenIds(): ReadonlySet<string> {
    return this.container.getAutoMockedTokenIds()
  }

  // ===========================================================================
  // LIFECYCLE ASSERTIONS
  // ===========================================================================

  /**
   * Asserts that a service's onServiceInit was called.
   */
  expectInitialized(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectInitialized(token)
  }

  /**
   * Asserts that a service's onServiceDestroy was called.
   */
  expectDestroyed(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectDestroyed(token)
  }

  /**
   * Asserts that a service has NOT been destroyed.
   */
  expectNotDestroyed(token: ClassType | InjectionToken<any, any>): void {
    this.container.expectNotDestroyed(token)
  }

  /**
   * Records a lifecycle event for tracking.
   * Call this from your mock implementations if needed.
   */
  recordLifecycleEvent(
    token: ClassType | InjectionToken<any, any>,
    event: 'created' | 'initialized' | 'destroyed',
    instanceName: string,
  ): void {
    this.container.recordLifecycleEvent(token, event, instanceName)
  }
}
