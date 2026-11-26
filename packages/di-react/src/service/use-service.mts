import { serviceResult, useResolvedService } from './use-resolved-service.mjs'

import type { AnyServiceToken, ServiceHook, UseServiceResult } from './types.mjs'

/**
 * Hook to load a service from the DI container, with its loading and error
 * state. Resolves again when the instance is invalidated.
 *
 * @example
 * ```tsx
 * function UserCard() {
 *   const { data: users, error } = useService(UserService)
 *
 *   if (error) return <p>{error.message}</p>
 *   if (!users) return <p>Loading…</p>
 *
 *   return <UserList users={users} />
 * }
 * ```
 */
export const useService = function useService(
  token: AnyServiceToken,
  args?: unknown,
): UseServiceResult<any> {
  const { state, refetch } = useResolvedService(token, args, { optional: false })
  return serviceResult(state, refetch)
} as ServiceHook<'service'>
