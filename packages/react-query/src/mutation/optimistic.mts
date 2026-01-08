import type { QueryClient } from '@tanstack/react-query'

/**
 * Configuration for creating optimistic update callbacks.
 *
 * @template TData - The mutation response data type
 * @template TVariables - The mutation variables type
 * @template TQueryData - The query cache data type
 */
export interface OptimisticUpdateConfig<
  _TData,
  TVariables,
  TQueryData,
> {
  /**
   * The query key to optimistically update.
   * This should match the query key used for the affected query.
   */
  queryKey: readonly unknown[]

  /**
   * Function to compute the optimistic cache value.
   * Receives the current cache data and mutation variables.
   *
   * @param oldData - Current data in the cache (may be undefined if not cached)
   * @param variables - The mutation variables being submitted
   * @returns The new optimistic cache value
   */
  updateFn: (oldData: TQueryData | undefined, variables: TVariables) => TQueryData

  /**
   * Whether to rollback on error.
   * Defaults to true.
   */
  rollbackOnError?: boolean

  /**
   * Whether to invalidate the query on settlement.
   * Defaults to true.
   */
  invalidateOnSettled?: boolean
}

/**
 * Return type for optimistic update callbacks.
 */
export interface OptimisticUpdateCallbacks<TData, TVariables, TQueryData> {
  /**
   * Called before the mutation starts. Cancels outgoing refetches,
   * snapshots the current cache value, and applies the optimistic update.
   */
  onMutate: (
    variables: TVariables,
    context: { queryClient: QueryClient },
  ) => Promise<{ previousData: TQueryData | undefined }>

  /**
   * Called when the mutation fails. Rolls back the cache to the previous
   * value if rollbackOnError is enabled.
   */
  onError: (
    err: Error,
    variables: TVariables,
    context: { previousData?: TQueryData; queryClient: QueryClient },
  ) => void

  /**
   * Called when the mutation completes (success or error).
   * Invalidates the query if invalidateOnSettled is enabled.
   */
  onSettled: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
    context: { queryClient: QueryClient },
  ) => void
}

/**
 * Creates type-safe optimistic update callbacks for mutations.
 *
 * This helper generates the onMutate, onError, and onSettled callbacks
 * that implement the standard optimistic update pattern:
 *
 * 1. onMutate: Cancel refetches, snapshot cache, apply optimistic update
 * 2. onError: Rollback cache to previous value on failure
 * 3. onSettled: Invalidate query to refetch fresh data
 *
 * @experimental This API is experimental and may change in future versions.
 * Use with caution in production code.
 *
 * @param config - Configuration for the optimistic update
 * @returns Object containing onMutate, onError, and onSettled callbacks
 *
 * @example
 * ```ts
 * // Create a mutation with optimistic updates
 * const updateUser = client.mutation({
 *   method: 'PATCH',
 *   url: '/users/$userId',
 *   requestSchema: updateUserSchema,
 *   responseSchema: userSchema,
 *   processResponse: (data) => data,
 *   ...createOptimisticUpdate({
 *     queryKey: ['users', userId],
 *     updateFn: (oldData, variables) => ({
 *       ...oldData,
 *       ...variables.data,
 *     }),
 *   }),
 * })
 * ```
 *
 * @example
 * ```ts
 * // Optimistic update for adding an item to a list
 * const addTodo = client.mutation({
 *   method: 'POST',
 *   url: '/todos',
 *   requestSchema: createTodoSchema,
 *   responseSchema: todoSchema,
 *   processResponse: (data) => data,
 *   ...createOptimisticUpdate({
 *     queryKey: ['todos'],
 *     updateFn: (oldData, variables) => [
 *       ...(oldData ?? []),
 *       { id: 'temp-id', ...variables.data, createdAt: new Date() },
 *     ],
 *   }),
 * })
 * ```
 *
 * @example
 * ```ts
 * // Optimistic delete
 * const deleteTodo = client.mutation({
 *   method: 'DELETE',
 *   url: '/todos/$todoId',
 *   responseSchema: z.object({ success: z.boolean() }),
 *   processResponse: (data) => data,
 *   ...createOptimisticUpdate({
 *     queryKey: ['todos'],
 *     updateFn: (oldData, variables) =>
 *       (oldData ?? []).filter((t) => t.id !== variables.urlParams.todoId),
 *   }),
 * })
 * ```
 */
export function createOptimisticUpdate<
  TData,
  TVariables,
  TQueryData,
>(config: OptimisticUpdateConfig<TData, TVariables, TQueryData>): OptimisticUpdateCallbacks<TData, TVariables, TQueryData> {
  const {
    queryKey,
    updateFn,
    rollbackOnError = true,
    invalidateOnSettled = true,
  } = config

  return {
    onMutate: async (
      variables: TVariables,
      context: { queryClient: QueryClient },
    ) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await context.queryClient.cancelQueries({ queryKey })

      // Snapshot the previous value
      const previousData = context.queryClient.getQueryData<TQueryData>(queryKey)

      // Optimistically update the cache
      context.queryClient.setQueryData<TQueryData>(
        queryKey,
        (old) => updateFn(old, variables),
      )

      // Return context with the previous data for potential rollback
      return { previousData }
    },

    onError: (
      _err: Error,
      _variables: TVariables,
      context: { previousData?: TQueryData; queryClient: QueryClient },
    ) => {
      // Rollback to the previous value on error
      if (rollbackOnError && context?.previousData !== undefined) {
        context.queryClient.setQueryData(queryKey, context.previousData)
      }
    },

    onSettled: (
      _data: TData | undefined,
      _error: Error | null,
      _variables: TVariables,
      context: { queryClient: QueryClient },
    ) => {
      // Always invalidate to ensure we have the correct server state
      if (invalidateOnSettled) {
        void context.queryClient.invalidateQueries({ queryKey })
      }
    },
  }
}

/**
 * Creates optimistic update callbacks that work with multiple query keys.
 *
 * Useful when a mutation affects multiple cached queries.
 *
 * @experimental This API is experimental and may change in future versions.
 * Use with caution in production code.
 *
 * @param configs - Array of optimistic update configurations
 * @returns Combined callbacks that handle all specified queries
 *
 * @example
 * ```ts
 * // Updating a user affects both user detail and user list queries
 * const updateUser = client.mutation({
 *   method: 'PATCH',
 *   url: '/users/$userId',
 *   requestSchema: updateUserSchema,
 *   responseSchema: userSchema,
 *   processResponse: (data) => data,
 *   ...createMultiOptimisticUpdate([
 *     {
 *       queryKey: ['users', userId],
 *       updateFn: (oldData, variables) => ({ ...oldData, ...variables.data }),
 *     },
 *     {
 *       queryKey: ['users'],
 *       updateFn: (oldList, variables) =>
 *         (oldList ?? []).map((u) =>
 *           u.id === userId ? { ...u, ...variables.data } : u
 *         ),
 *     },
 *   ]),
 * })
 * ```
 */
export function createMultiOptimisticUpdate<TData, TVariables>(
  configs: Array<OptimisticUpdateConfig<TData, TVariables, unknown>>,
): OptimisticUpdateCallbacks<TData, TVariables, Map<string, unknown>> {
  return {
    onMutate: async (
      variables: TVariables,
      context: { queryClient: QueryClient },
    ) => {
      // Cancel and snapshot all queries
      const previousData = new Map<string, unknown>()

      for (const config of configs) {
        await context.queryClient.cancelQueries({ queryKey: config.queryKey })
        const key = JSON.stringify(config.queryKey)
        previousData.set(key, context.queryClient.getQueryData(config.queryKey))
        context.queryClient.setQueryData(
          config.queryKey,
          (old: unknown) => config.updateFn(old, variables),
        )
      }

      return { previousData }
    },

    onError: (
      _err: Error,
      _variables: TVariables,
      context: { previousData?: Map<string, unknown>; queryClient: QueryClient },
    ) => {
      // Rollback all queries
      if (context?.previousData) {
        for (const config of configs) {
          if (config.rollbackOnError !== false) {
            const key = JSON.stringify(config.queryKey)
            const previous = context.previousData.get(key)
            if (previous !== undefined) {
              context.queryClient.setQueryData(config.queryKey, previous)
            }
          }
        }
      }
    },

    onSettled: (
      _data: TData | undefined,
      _error: Error | null,
      _variables: TVariables,
      context: { queryClient: QueryClient },
    ) => {
      // Invalidate all queries
      for (const config of configs) {
        if (config.invalidateOnSettled !== false) {
          void context.queryClient.invalidateQueries({ queryKey: config.queryKey })
        }
      }
    },
  }
}
