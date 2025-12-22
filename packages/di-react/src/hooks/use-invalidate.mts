import { useCallback } from 'react'

import { useContainer } from './use-container.mjs'

/**
 * Hook that returns a function to invalidate a service instance directly.
 *
 * This is useful when you have the service instance and want to invalidate it
 * without knowing its token.
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const { data: user } = useService(UserService)
 *   const invalidateInstance = useInvalidateInstance()
 *
 *   const handleRefresh = () => {
 *     if (user) {
 *       invalidateInstance(user)
 *     }
 *   }
 *
 *   return (
 *     <div>
 *       <span>{user?.name}</span>
 *       <button onClick={handleRefresh}>Refresh</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useInvalidateInstance(): (instance: unknown) => Promise<void> {
  const container = useContainer()

  return useCallback(
    async (instance: unknown) => {
      await container.invalidate(instance)
    },
    [container],
  )
}
