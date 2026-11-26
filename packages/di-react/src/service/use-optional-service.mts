import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InferInput,
  InjectionToken,
  MissingArgsError,
  ResolvedInstance,
  StandardSchemaV1,
} from '@navios/di'

import { serviceResult, useResolvedService } from './use-resolved-service.mjs'

import type { AnyServiceToken, UseOptionalServiceResult } from './types.mjs'

// #1 Simple class
export function useOptionalService<T extends ClassType>(
  token: T,
): UseOptionalServiceResult<ResolvedInstance<T>>

// #2 Token with required Schema
export function useOptionalService<T, S extends StandardSchemaV1>(
  token: InjectionToken<T, S>,
  args: InferInput<S>,
): UseOptionalServiceResult<T>

// #3 Token with optional Schema
export function useOptionalService<T, S extends StandardSchemaV1, R extends boolean>(
  token: InjectionToken<T, S, R>,
): R extends false ? UseOptionalServiceResult<T> : MissingArgsError<S>

// #4 Token with no Schema
export function useOptionalService<T>(
  token: InjectionToken<T, unknown>,
): UseOptionalServiceResult<T>

export function useOptionalService<T>(
  token: BoundInjectionToken<T, any>,
): UseOptionalServiceResult<T>

export function useOptionalService<T>(
  token: FactoryInjectionToken<T, any>,
): UseOptionalServiceResult<T>

/**
 * Hook to optionally load a service from the DI container.
 *
 * Unlike useService, a token without a provider is not an error: the hook
 * returns `isNotFound: true` instead.
 *
 * This is useful for:
 * - Optional dependencies that may or may not be configured
 * - Feature flags where a service might not be available
 * - Plugins or extensions that are conditionally registered
 *
 * @example
 * ```tsx
 * function Analytics() {
 *   const { data: analytics, isNotFound } = useOptionalService(AnalyticsService)
 *
 *   if (isNotFound) {
 *     // Analytics service not configured, skip tracking
 *     return null
 *   }
 *
 *   return <AnalyticsTracker service={analytics} />
 * }
 * ```
 */
export function useOptionalService(
  token: AnyServiceToken,
  args?: unknown,
): UseOptionalServiceResult<any> {
  const { state, refetch } = useResolvedService(token, args, { optional: true })
  return { ...serviceResult(state, refetch), isNotFound: state.status === 'not-found' }
}
