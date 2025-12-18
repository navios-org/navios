import type { ScopedContainer } from '@navios/di'

import { useContext } from 'react'

import { ScopedContainerContext } from '../providers/context.mjs'

/**
 * Hook to get the current scope ID.
 * Returns null if not inside a ScopeProvider.
 */
export function useScope(): string | null {
  const scopedContainer = useContext(ScopedContainerContext)
  return scopedContainer?.getRequestId() ?? null
}

/**
 * Hook to get the current scope ID, throwing if not inside a ScopeProvider.
 * Use this when your component requires a scope to function correctly.
 */
export function useScopeOrThrow(): string {
  const scopeId = useScope()
  if (scopeId === null) {
    throw new Error(
      'useScopeOrThrow must be used within a ScopeProvider. ' +
        'Wrap your component tree with <ScopeProvider> to create a request scope.',
    )
  }
  return scopeId
}

/**
 * Hook to get the current ScopedContainer.
 * Returns null if not inside a ScopeProvider.
 *
 * Use this to access scope metadata or other ScopedContainer methods.
 *
 * @example
 * ```tsx
 * function TableRow() {
 *   const scope = useScopedContainer()
 *   const rowData = scope?.getMetadata('rowData')
 *   // ...
 * }
 * ```
 */
export function useScopedContainer(): ScopedContainer | null {
  return useContext(ScopedContainerContext)
}

/**
 * Hook to get the current ScopedContainer, throwing if not inside a ScopeProvider.
 * Use this when your component requires a scope to function correctly.
 */
export function useScopedContainerOrThrow(): ScopedContainer {
  const scopedContainer = useScopedContainer()
  if (scopedContainer === null) {
    throw new Error(
      'useScopedContainerOrThrow must be used within a ScopeProvider. ' +
        'Wrap your component tree with <ScopeProvider> to create a request scope.',
    )
  }
  return scopedContainer
}

/**
 * Hook to get metadata from the current scope.
 * Returns undefined if not inside a ScopeProvider or if the key doesn't exist.
 *
 * @example
 * ```tsx
 * // In parent component:
 * <ScopeProvider metadata={{ userId: '123', theme: 'dark' }}>
 *   <ChildComponent />
 * </ScopeProvider>
 *
 * // In child component:
 * function ChildComponent() {
 *   const userId = useScopeMetadata<string>('userId')
 *   const theme = useScopeMetadata<'light' | 'dark'>('theme')
 *   // ...
 * }
 * ```
 */
export function useScopeMetadata<T = unknown>(key: string): T | undefined {
  const scopedContainer = useContext(ScopedContainerContext)
  return scopedContainer?.getMetadata(key) as T | undefined
}
