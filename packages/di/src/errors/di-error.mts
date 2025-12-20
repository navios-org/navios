export enum DIErrorCode {
  FactoryNotFound = 'FactoryNotFound',
  FactoryTokenNotResolved = 'FactoryTokenNotResolved',
  InstanceNotFound = 'InstanceNotFound',
  InstanceDestroying = 'InstanceDestroying',
  CircularDependency = 'CircularDependency',
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
  }

  // Static factory methods for common error types
  static factoryNotFound(name: string): DIError {
    return new DIError(
      DIErrorCode.FactoryNotFound,
      `Factory ${name} not found`,
      { name },
    )
  }

  static factoryTokenNotResolved(token: string | symbol | unknown): DIError {
    return new DIError(
      DIErrorCode.FactoryTokenNotResolved,
      `Factory token not resolved: ${token?.toString() ?? 'unknown'}`,
      { token },
    )
  }

  static instanceNotFound(name: string): DIError {
    return new DIError(
      DIErrorCode.InstanceNotFound,
      `Instance ${name} not found`,
      { name },
    )
  }

  static instanceDestroying(name: string): DIError {
    return new DIError(
      DIErrorCode.InstanceDestroying,
      `Instance ${name} destroying`,
      { name },
    )
  }

  static unknown(
    message: string | Error,
    context?: Record<string, unknown>,
  ): DIError {
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
}
