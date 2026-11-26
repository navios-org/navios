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

import type { AnyServiceToken, UseServiceResult } from './types.mjs'

// #1 Simple class
export function useService<T extends ClassType>(token: T): UseServiceResult<ResolvedInstance<T>>

// #2 Token with required Schema
export function useService<T, S extends StandardSchemaV1>(
  token: InjectionToken<T, S>,
  args: InferInput<S>,
): UseServiceResult<T>

// #3 Token with optional Schema
export function useService<T, S extends StandardSchemaV1, R extends boolean>(
  token: InjectionToken<T, S, R>,
): R extends false ? UseServiceResult<T> : MissingArgsError<S>

// #4 Token with no Schema
export function useService<T>(token: InjectionToken<T, unknown>): UseServiceResult<T>

export function useService<T>(token: BoundInjectionToken<T, any>): UseServiceResult<T>

export function useService<T>(token: FactoryInjectionToken<T, any>): UseServiceResult<T>

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
export function useService(token: AnyServiceToken, args?: unknown): UseServiceResult<any> {
  const { state, refetch } = useResolvedService(token, args, { optional: false })
  return serviceResult(state, refetch)
}
