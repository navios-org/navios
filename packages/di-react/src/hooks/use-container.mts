import { useContext } from 'react'

import type { Container, ScopedContainer } from '@navios/di'

import { ContainerContext, ScopedContainerContext } from '../providers/context.mjs'

/**
 * Hook to get the current container (ScopedContainer if inside ScopeProvider, otherwise Container).
 *
 * This is the primary hook for accessing the DI container. It automatically
 * returns the correct container based on context:
 * - Inside a ScopeProvider: returns the ScopedContainer for request-scoped services
 * - Outside a ScopeProvider: returns the root Container
 *
 * @returns The current container (ScopedContainer or Container)
 */
export function useContainer(): Container | ScopedContainer {
  const scopedContainer = useContext(ScopedContainerContext)
  const container = useContext(ContainerContext)

  // Prefer scoped container if available (we're inside a ScopeProvider)
  if (scopedContainer) {
    return scopedContainer
  }

  if (!container) {
    throw new Error('useContainer must be used within a ContainerProvider')
  }

  return container
}

/**
 * Hook to get the root Container, regardless of whether we're inside a ScopeProvider.
 *
 * Use this when you need access to the root container specifically,
 * for example to create new request scopes programmatically.
 *
 * @returns The root Container
 */
export function useRootContainer(): Container {
  const container = useContext(ContainerContext)

  if (!container) {
    throw new Error('useRootContainer must be used within a ContainerProvider')
  }

  return container
}

/**
 * Hook to get the current ScopedContainer if inside a ScopeProvider.
 *
 * @returns The ScopedContainer or null if not inside a ScopeProvider
 */
export function useScopedContainer(): ScopedContainer | null {
  return useContext(ScopedContainerContext)
}
