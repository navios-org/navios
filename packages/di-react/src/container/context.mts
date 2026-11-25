import { createContext } from 'react'

import type { Container, ScopedContainer } from '@navios/di'

/**
 * Context for the root Container.
 * This is set by ContainerProvider and provides the base container.
 */
export const ContainerContext = createContext<Container | null>(null)

/**
 * Context for the current ScopedContainer (if inside a ScopeProvider).
 * This allows nested components to access request-scoped services.
 */
export const ScopedContainerContext = createContext<ScopedContainer | null>(null)
