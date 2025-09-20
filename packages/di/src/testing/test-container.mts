import type { ClassType, InjectionToken } from '../injection-token.mjs'
import type { Registry } from '../registry.mjs'
import type { Injectors } from '../utils/index.mjs'

import { Container } from '../container.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { globalRegistry } from '../registry.mjs'
import { getInjectableToken } from '../utils/index.mjs'

/**
 * A binding builder for the TestContainer that allows chaining binding operations.
 */
export class TestBindingBuilder<T> {
  constructor(
    private readonly container: TestContainer,
    private readonly token: InjectionToken<T, any>,
  ) {}

  /**
   * Binds the token to a specific value.
   * This is useful for testing with mock values or constants.
   * @param value The value to bind to the token
   */
  toValue(value: T): TestContainer {
    const instanceName = this.container
      .getServiceLocator()
      .getInstanceIdentifier(this.token)
    this.container
      .getServiceLocator()
      .getManager()
      .storeCreatedHolder(
        instanceName,
        value,
        InjectableType.Class,
        InjectableScope.Singleton,
      )
    return this.container
  }

  /**
   * Binds the token to a class constructor.
   * @param target The class constructor to bind to
   */
  toClass(target: ClassType): TestContainer {
    this.container['registry'].set(
      this.token,
      InjectableScope.Singleton,
      target,
      InjectableType.Class,
    )
    return this.container
  }
}

/**
 * TestContainer extends the base Container with additional methods useful for testing.
 * It provides a simplified API for binding values and classes during test setup.
 */
@Injectable()
export class TestContainer extends Container {
  constructor(
    registry: Registry = globalRegistry,
    logger: Console | null = null,
    injectors: Injectors = undefined as any,
  ) {
    super(registry, logger, injectors)
  }

  /**
   * Creates a binding builder for the given token.
   * This allows chaining binding operations like bind(Token).toValue(value).
   * @param token The injection token to bind
   * @returns A TestBindingBuilder for chaining binding operations
   */
  bind<T>(token: ClassType): TestBindingBuilder<T>
  bind<T>(token: InjectionToken<T, any>): TestBindingBuilder<T>
  bind(token: any): TestBindingBuilder<any> {
    let realToken = token
    if (typeof token === 'function') {
      realToken = getInjectableToken(token)
    }
    return new TestBindingBuilder(this, realToken)
  }

  /**
   * Binds a value directly to a token.
   * This is a convenience method equivalent to bind(token).toValue(value).
   * @param token The injection token to bind
   * @param value The value to bind to the token
   * @returns The TestContainer instance for chaining
   */
  bindValue<T>(token: ClassType, value: T): TestContainer
  bindValue<T>(token: InjectionToken<T, any>, value: T): TestContainer
  bindValue(token: any, value: any): TestContainer {
    return this.bind(token).toValue(value)
  }

  /**
   * Binds a class to a token.
   * This is a convenience method equivalent to bind(token).toClass(target).
   * @param token The injection token to bind
   * @param target The class constructor to bind to
   * @returns The TestContainer instance for chaining
   */
  bindClass(token: ClassType, target: ClassType): TestContainer
  bindClass<T>(token: InjectionToken<T, any>, target: ClassType): TestContainer
  bindClass(token: any, target: any): TestContainer {
    return this.bind(token).toClass(target)
  }

  /**
   * Creates a new TestContainer instance with the same configuration.
   * This is useful for creating isolated test containers.
   * @returns A new TestContainer instance
   */
  createChild(): TestContainer {
    return new TestContainer(this.registry, this.logger, this.injectors)
  }
}
