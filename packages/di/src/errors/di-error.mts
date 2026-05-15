import type { TokenSchemaType } from '../token/token.mjs'
import type { FactoryRecord } from '../token/registry.mjs'

export enum DIErrorCode {
  FactoryNotFound = 'FactoryNotFound',
  FactoryTokenNotResolved = 'FactoryTokenNotResolved',
  InstanceNotFound = 'InstanceNotFound',
  InstanceDestroying = 'InstanceDestroying',
  CircularDependency = 'CircularDependency',
  TokenValidationError = 'TokenValidationError',
  TokenSchemaRequiredError = 'TokenSchemaRequiredError',
  ClassNotInjectable = 'ClassNotInjectable',
  ScopeMismatchError = 'ScopeMismatchError',
  ScopeIncompatible = 'ScopeIncompatible',
  PriorityConflictError = 'PriorityConflictError',
  StorageError = 'StorageError',
  InitializationError = 'InitializationError',
  DependencyResolutionError = 'DependencyResolutionError',
  UnknownError = 'UnknownError',
}

export class DIError extends Error {
  public readonly context?: Record<string, unknown>

  constructor(
    public readonly code: DIErrorCode,
    public readonly message: string,
    context?: Record<string, unknown>,
  ) {
    super(message)
    this.context = context
    this.name = 'DIError'
  }

  // Static factory methods for common error types
  static factoryNotFound(name: string): DIError {
    return new DIError(DIErrorCode.FactoryNotFound, `Factory ${name} not found`, { name })
  }

  static factoryTokenNotResolved(token: string | symbol | unknown): DIError {
    return new DIError(
      DIErrorCode.FactoryTokenNotResolved,
      `Factory token not resolved: ${token?.toString() ?? 'unknown'}`,
      { token },
    )
  }

  static instanceNotFound(name: string): DIError {
    return new DIError(DIErrorCode.InstanceNotFound, `Instance ${name} not found`, { name })
  }

  static instanceDestroying(name: string): DIError {
    return new DIError(DIErrorCode.InstanceDestroying, `Instance ${name} destroying`, { name })
  }

  static unknown(message: string | Error, context?: Record<string, unknown>): DIError {
    if (message instanceof Error) {
      return new DIError(DIErrorCode.UnknownError, message.message, {
        ...context,
        parent: message,
      })
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
    schema: TokenSchemaType | undefined,
    value: unknown,
  ): DIError {
    return new DIError(DIErrorCode.TokenValidationError, message, {
      schema,
      value,
    })
  }

  static tokenSchemaRequiredError(token: string | symbol | unknown): DIError {
    return new DIError(
      DIErrorCode.TokenSchemaRequiredError,
      `Token ${token?.toString() ?? 'unknown'} requires schema arguments and cannot be used with addInstance. Use BoundToken or provide arguments when resolving.`,
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
   * Fail-fast scope-compatibility error (v2 replacement for the deleted
   * runtime scope-upgrade). Thrown at first resolution of a class when an
   * eager (`@Inject`/`@InjectDerived`) dependency's scope outlives the host's:
   * a Singleton host eagerly depending on a Request- or Transient-scoped
   * service. The message names the host, the dependency, both scopes, and the
   * actionable fixes (mark the host Request, or use `@InjectLazy`).
   */
  static scopeMismatch(
    hostName: string,
    depName: string,
    hostScope: string,
    depScope: string,
  ): DIError {
    const fix =
      depScope === 'Transient'
        ? `use @InjectLazy(${depName}) for transient dependencies`
        : `mark ${hostName} as @Injectable({ scope: Request }) or wrap the dependency in @InjectLazy(${depName})`
    return new DIError(
      DIErrorCode.ScopeIncompatible,
      `Scope mismatch: ${hostName} is ${hostScope} but eagerly depends on ${depName} (${depScope}). A ${hostScope}-scoped service cannot eagerly hold a ${depScope}-scoped dependency — ${fix}.`,
      { hostName, depName, hostScope, depScope },
    )
  }

  static priorityConflictError(
    token: string | symbol | unknown,
    records: FactoryRecord[],
  ): DIError {
    return new DIError(
      DIErrorCode.PriorityConflictError,
      `Priority conflict for ${token?.toString() ?? 'unknown'}: multiple bindings with same priority`,
      { token, records },
    )
  }

  static storageError(message: string, operation: string, instanceName?: string): DIError {
    return new DIError(DIErrorCode.StorageError, `Storage error: ${message}`, {
      operation,
      instanceName,
    })
  }

  static initializationError(serviceName: string, error: Error | string): DIError {
    return new DIError(
      DIErrorCode.InitializationError,
      `Service ${serviceName} initialization failed: ${error instanceof Error ? error.message : error}`,
      { serviceName, error },
    )
  }

  static dependencyResolutionError(
    serviceName: string,
    dependencyName: string,
    error: Error | string,
  ): DIError {
    return new DIError(
      DIErrorCode.DependencyResolutionError,
      `Failed to resolve dependency ${dependencyName} for service ${serviceName}: ${error instanceof Error ? error.message : error}`,
      { serviceName, dependencyName, error },
    )
  }
}
