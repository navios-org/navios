export enum DIErrorCode {
  ProviderNotFound = 'ProviderNotFound',
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

/**
 * What every failure of the container is reported as. `context` describes the
 * failure with names and paths; it never holds the args of a token.
 */
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
}
