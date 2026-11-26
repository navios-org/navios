import { serviceResult, useResolvedService } from './use-resolved-service.mjs'

import type { AnyServiceToken, ServiceHook, UseOptionalServiceResult } from './types.mjs'

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
export const useOptionalService = function useOptionalService(
  token: AnyServiceToken,
  args?: unknown,
): UseOptionalServiceResult<any> {
  const { state, refetch } = useResolvedService(token, args, { optional: true })
  return { ...serviceResult(state, refetch), isNotFound: state.status === 'not-found' }
} as ServiceHook<'optional'>
