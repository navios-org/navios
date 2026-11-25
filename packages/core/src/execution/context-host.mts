import { BoundInjectionToken, FactoryInjectionToken, InjectableScope } from '@navios/di'

import type { AnyInjectableType, ClassType, Container, InjectionToken } from '@navios/di'

import type { LoggerService } from '../logger/logger-output.mjs'

/**
 * Dependencies shared by every execution context of an application.
 */
export interface ContextHost {
  readonly container: Container
  /**
   * Called when a token is used through a context; may throw. Does nothing for
   * a token that `needsScope` is false for.
   */
  onScopedUse: ((token: AnyInjectableType) => void) | null
  /** Receives what an `onFinish` callback throws; without it that is dropped. */
  readonly logger?: Pick<LoggerService, 'error'>
}

function tokenName(token: unknown): string {
  return typeof token === 'function' ? token.name : String(token)
}

type PlainToken = ClassType | InjectionToken<unknown, unknown>

/** The token itself, without the args that are bound to it. */
function plainToken(token: AnyInjectableType): PlainToken {
  return (
    token instanceof BoundInjectionToken || token instanceof FactoryInjectionToken
      ? token.token
      : token
  ) as PlainToken
}

/**
 * Whether a context resolves `token` from a DI scope of its execution. A
 * singleton is the same in all of them.
 */
export function needsScope(container: Container, token: AnyInjectableType): boolean {
  return container.getProvider(plainToken(token))?.scope !== InjectableScope.Singleton
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
    return { container, onScopedUse: null, logger }
  }
  const seen = new Set<PlainToken>()
  return {
    container,
    logger,
    onScopedUse: (used) => {
      if (!needsScope(container, used)) {
        return
      }
      const token = plainToken(used)
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
