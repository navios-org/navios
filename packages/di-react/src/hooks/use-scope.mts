import { useContext } from 'react'

import { ScopeContext } from '../providers/scope-provider.mjs'

/**
 * Hook to get the current scope ID.
 * Returns null if not inside a ScopeProvider.
 */
export function useScope(): string | null {
  return useContext(ScopeContext)
}

/**
 * Hook to get the current scope ID, throwing if not inside a ScopeProvider.
 * Use this when your component requires a scope to function correctly.
 */
export function useScopeOrThrow(): string {
  const scope = useScope()
  if (scope === null) {
    throw new Error(
      'useScopeOrThrow must be used within a ScopeProvider. ' +
        'Wrap your component tree with <ScopeProvider> to create a request scope.',
    )
  }
  return scope
}
