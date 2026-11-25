import type { AnyInjectableType, Container } from '@navios/di'

import type { LoggerService } from '../logger/logger-output.mjs'

/**
 * Dependencies shared by every execution context of an application.
 */
export interface ContextHost {
  readonly container: Container
  /** Called the first time a request-scoped token is used; may throw. */
  onScopedUse: ((token: AnyInjectableType) => void) | null
}

function tokenName(token: unknown): string {
  return typeof token === 'function' ? token.name : String(token)
}

/**
 * Builds the host for an application's contexts, applying its policy for
 * request-scoped services.
 */
export function createContextHost(
  container: Container,
  mode: 'allow' | 'warn' | 'forbid',
  logger: LoggerService,
): ContextHost {
  if (mode === 'allow') {
    return { container, onScopedUse: null }
  }
  const seen = new Set<unknown>()
  return {
    container,
    onScopedUse: (token) => {
      if (mode === 'forbid') {
        throw new Error(
          `[Navios] ${tokenName(token)} was requested with ctx.use()/ctx.resolve(), but this ` +
            `application forbids request-scoped services (requestScopedServices: 'forbid'). ` +
            `Keep per-execution data in a context key instead.`,
        )
      }
      if (!seen.has(token)) {
        seen.add(token)
        logger.warn(
          `${tokenName(token)} is resolved for every execution with ctx.use()/ctx.resolve(). ` +
            `If it only carries data derived from the context, a context key is cheaper and ` +
            `needs no DI scope. Set requestScopedServices: 'allow' to silence this.`,
        )
      }
    },
  }
}
