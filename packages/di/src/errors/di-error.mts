export enum DIErrorCode {
  FactoryNotFound = 'FactoryNotFound',
  InstanceNotFound = 'InstanceNotFound',
  InstanceDestroying = 'InstanceDestroying',
  CircularDependency = 'CircularDependency',
  TokenValidationError = 'TokenValidationError',
  TokenSchemaRequiredError = 'TokenSchemaRequiredError',
  ClassNotInjectable = 'ClassNotInjectable',
  ScopeMismatchError = 'ScopeMismatchError',
  ProviderConflict = 'ProviderConflict',
  AsyncInitRequired = 'AsyncInitRequired',
  ContainerDisposed = 'ContainerDisposed',
  InitializationError = 'InitializationError',
  OutsideInjectionContext = 'OutsideInjectionContext',
  AccessBeforeInit = 'AccessBeforeInit',
  UnknownError = 'UnknownError',
}

export class DIError extends Error {
  public readonly context?: Record<string, unknown>

  constructor(
    public readonly code: DIErrorCode,
    message: string,
    context?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.context = context
    this.name = 'DIError'
  }

  static factoryNotFound(name: string): DIError {
    return new DIError(DIErrorCode.FactoryNotFound, `Factory ${name} not found`, { name })
  }

  static instanceNotFound(name: string): DIError {
    return new DIError(DIErrorCode.InstanceNotFound, `Instance ${name} not found`, { name })
  }

  static instanceDestroying(name: string): DIError {
    return new DIError(DIErrorCode.InstanceDestroying, `Instance ${name} destroying`, { name })
  }

  static unknown(message: string | Error, context?: Record<string, unknown>): DIError {
    if (message instanceof Error) {
      return new DIError(
        DIErrorCode.UnknownError,
        message.message,
        { ...context, parent: message },
        { cause: message },
      )
    }
    return new DIError(DIErrorCode.UnknownError, message, context)
  }

  static circularDependency(cycle: string[]): DIError {
    const cycleStr = cycle.join(' -> ')
    return new DIError(
      DIErrorCode.CircularDependency,
      `Circular dependency detected: ${cycleStr}`,
      { cycle },
    )
  }

  static tokenValidationError(
    message: string,
    schema: unknown,
    value: unknown,
    issues?: unknown[],
  ): DIError {
    return new DIError(DIErrorCode.TokenValidationError, message, { schema, value, issues })
  }

  static tokenSchemaRequiredError(token: string | symbol | unknown): DIError {
    return new DIError(
      DIErrorCode.TokenSchemaRequiredError,
      `Token ${token?.toString() ?? 'unknown'} requires schema arguments and cannot be used with addInstance. Use BoundInjectionToken or provide arguments when resolving.`,
      { token },
    )
  }

  static classNotInjectable(className: string): DIError {
    return new DIError(
      DIErrorCode.ClassNotInjectable,
      `Class ${className} is not decorated with @Injectable.`,
      { className },
    )
  }

  static scopeMismatchError(
    token: string | symbol | unknown,
    expectedScope: string,
    actualScope: string,
  ): DIError {
    return new DIError(
      DIErrorCode.ScopeMismatchError,
      `Scope mismatch for ${token?.toString() ?? 'unknown'}: expected ${expectedScope}, got ${actualScope}`,
      { token, expectedScope, actualScope },
    )
  }

  /**
   * A request-scoped service was reached from the root container, either
   * directly or through the dependencies of a singleton.
   */
  static requestScopeFromRoot(name: string, path: string[]): DIError {
    const via = path.length > 0 ? ` (${[...path, name].join(' -> ')})` : ''
    return new DIError(
      DIErrorCode.ScopeMismatchError,
      `Scope mismatch: ${name} is request-scoped and cannot be resolved from the root container${via}. ` +
        `Resolve it from a scope created with container.createScope(), and do not inject it into a singleton.`,
      { name, path },
    )
  }

  static providerConflict(token: string, existing: string, incoming: string): DIError {
    return new DIError(
      DIErrorCode.ProviderConflict,
      `Token ${token} already has a default provider (${existing}); ${incoming} cannot become a second default. ` +
        `Use provide(token, ${incoming}) on the container to replace it.`,
      { token, existing, incoming },
    )
  }

  static asyncInitRequired(name: string): DIError {
    return new DIError(
      DIErrorCode.AsyncInitRequired,
      `${name} or one of its dependencies has an asynchronous initializer and cannot be resolved synchronously. Use the async resolution method instead.`,
      { name },
    )
  }

  static containerDisposed(kind: string): DIError {
    return new DIError(DIErrorCode.ContainerDisposed, `${kind} has been disposed`, { kind })
  }

  // `inject()`, `asyncInject()` or `optional()` called outside a construction.
  static outsideInjectionContext(what: string): DIError {
    return new DIError(
      DIErrorCode.OutsideInjectionContext,
      `[Injector] Trying to access ${what} outside of a injectable context`,
      { what },
    )
  }

  // A dependency was used in a constructor before it finished initialising.
  static accessBeforeInit(name: string): DIError {
    return new DIError(
      DIErrorCode.AccessBeforeInit,
      `[Injector] Trying to access ${name} before it's initialized, please move the code to a onServiceInit method`,
      { name },
    )
  }

  static initializationError(serviceName: string, error: unknown): DIError {
    return new DIError(
      DIErrorCode.InitializationError,
      `Service ${serviceName} initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      { serviceName, error },
      { cause: error },
    )
  }
}
