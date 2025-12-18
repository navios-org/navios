import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '@navios/di'

import { useCallback } from 'react'

import { useContainer, useRootContainer } from './use-container.mjs'

type InvalidatableToken =
  | ClassType
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>

/**
 * Hook that returns a function to invalidate a service by its token.
 *
 * When called, this will:
 * 1. Destroy the current service instance
 * 2. Trigger re-fetch in all components using useService/useSuspenseService for that token
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const { data: user } = useService(UserService)
 *   const invalidateUser = useInvalidate(UserService)
 *
 *   const handleRefresh = () => {
 *     invalidateUser() // All components using UserService will re-fetch
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
export function useInvalidate<T extends InvalidatableToken>(
  token: T,
): () => Promise<void>

/**
 * Hook that returns a function to invalidate a service by its token with args.
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: string }) {
 *   const args = useMemo(() => ({ userId }), [userId])
 *   const { data: user } = useService(UserToken, args)
 *   const invalidateUser = useInvalidate(UserToken, args)
 *
 *   return (
 *     <div>
 *       <span>{user?.name}</span>
 *       <button onClick={() => invalidateUser()}>Refresh</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useInvalidate<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: S extends undefined ? never : unknown,
): () => Promise<void>

export function useInvalidate(
  token: InvalidatableToken,
  args?: unknown,
): () => Promise<void> {
  const rootContainer = useRootContainer()
  const serviceLocator = rootContainer.getServiceLocator()

  return useCallback(async () => {
    const instanceName = serviceLocator.getInstanceIdentifier(token, args)
    await serviceLocator.invalidate(instanceName)
  }, [serviceLocator, token, args])
}

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
