import type { StandardSchemaIssue } from '../schema/standard-schema.mjs'

import { DIError, DIErrorCode } from './di-error.mjs'

// The errors of the container, one function each. Nothing here takes the args
// of a token: they may hold secrets, and errors end up in logs.

function withPath(name: string, path: string[]): string {
  return path.length > 0 ? `${name} (${[...path, name].join(' -> ')})` : name
}

export function providerNotFound(name: string, path: string[]): DIError {
  return new DIError(DIErrorCode.ProviderNotFound, `No provider for ${withPath(name, path)}`, {
    name,
    path,
  })
}

/** The API was used in a way that cannot work. */
export function misuse(message: string, options?: { cause?: unknown }): DIError {
  return new DIError(DIErrorCode.UnknownError, `[DI] ${message}`, undefined, options)
}

export function notInjectable(value: unknown): DIError {
  return misuse(
    `${String(value)} is not an injectable class or token.` +
      (value === undefined
        ? ' A class or token that is undefined where it is used is often the result of a circular import.'
        : ''),
  )
}

export function foreignCopy(name: string): DIError {
  return misuse(
    `${name} belongs to another copy of @navios/di. Make sure every package resolves the same ` +
      `@navios/di: one version, not bundled into another package, and not loaded with both ` +
      `import and require.`,
  )
}

export function circularDependency(cycle: string[]): DIError {
  return new DIError(
    DIErrorCode.CircularDependency,
    `Circular dependency detected: ${cycle.join(' -> ')}`,
    { cycle },
  )
}

function issuePath(issue: StandardSchemaIssue): string {
  return (issue.path ?? [])
    .map((part) => String(typeof part === 'object' ? part.key : part))
    .join('.')
}

export function invalidArgs(name: string, issues: readonly StandardSchemaIssue[]): DIError {
  const found = issues.map((issue) => ({ path: issuePath(issue), message: issue.message }))
  const details = found.map(({ path, message }) => (path === '' ? message : `${path}: ${message}`))
  return new DIError(
    DIErrorCode.TokenValidationError,
    `Invalid args for ${name}: ${details.join('; ')}`,
    { name, issues: found },
  )
}

export function argsNotValidated(
  name: string,
  why: string,
  options?: { cause?: unknown },
): DIError {
  return new DIError(
    DIErrorCode.TokenValidationError,
    `Invalid args for ${name}: ${why}`,
    { name, issues: [] },
    options,
  )
}

export function argsRequired(name: string): DIError {
  return new DIError(
    DIErrorCode.TokenSchemaRequiredError,
    `Token ${name} requires args, so addInstance() needs to know which: pass InjectionToken.bound(token, args).`,
    { name },
  )
}

export function classNotInjectable(className: string): DIError {
  return new DIError(
    DIErrorCode.ClassNotInjectable,
    `Class ${className} is not decorated with @Injectable.`,
    { className },
  )
}

/**
 * A request-scoped service was reached from the root container, either
 * directly or through the dependencies of a singleton.
 */
export function requestScopeFromRoot(name: string, path: string[]): DIError {
  const via = path.length > 0 ? ` (${[...path, name].join(' -> ')})` : ''
  return new DIError(
    DIErrorCode.ScopeMismatchError,
    `Scope mismatch: ${name} is request-scoped and cannot be resolved from the root container${via}. ` +
      `Resolve it from a scope created with container.createScope(), and do not inject it into a singleton.`,
    { name, path },
  )
}

export function requestInstanceInRoot(name: string): DIError {
  return new DIError(
    DIErrorCode.ScopeMismatchError,
    `Scope mismatch: ${name} is request-scoped, so its instance belongs to a scope. ` +
      `Call addInstance() on a scope created with container.createScope().`,
    { name, path: [] },
  )
}

export function providerConflict(token: string, existing: string, incoming: string): DIError {
  return new DIError(
    DIErrorCode.ProviderConflict,
    `Token ${token} already has a default provider (${existing}); ${incoming} cannot become a second default. ` +
      `Use provide(token, ${incoming}) on the container to replace it.`,
    { token, existing, incoming },
  )
}

export function asyncInitRequired(name: string): DIError {
  return new DIError(
    DIErrorCode.AsyncInitRequired,
    `${name} or one of its dependencies has an asynchronous initializer and cannot be resolved synchronously. Use the async resolution method instead.`,
    { name },
  )
}

export function notYetDestroyed(name: string): DIError {
  return new DIError(
    DIErrorCode.AsyncInitRequired,
    `${name} is being destroyed and cannot be resolved synchronously. Use the async resolution method instead.`,
    { name },
  )
}

export function containerDisposed(kind: string): DIError {
  return new DIError(DIErrorCode.ContainerDisposed, `${kind} has been disposed`, { kind })
}

/** `inject()`, `asyncInject()` or `optional()` was called outside a construction. */
export function outsideInjectionContext(what: string): DIError {
  return new DIError(
    DIErrorCode.OutsideInjectionContext,
    `${what}() can only be called synchronously while a class or factory is being built; ` +
      `after an await use ctx.inject()`,
    { what },
  )
}

/** A dependency was used in a constructor before it finished initialising. */
export function accessBeforeInit(name: string): DIError {
  return new DIError(
    DIErrorCode.AccessBeforeInit,
    `[Injector] Trying to access ${name} before it's initialized, please move the code to a onServiceInit method`,
    { name },
  )
}

export function initializationError(serviceName: string, error: unknown): DIError {
  return new DIError(
    DIErrorCode.InitializationError,
    `Service ${serviceName} initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    { serviceName, error },
    { cause: error },
  )
}
