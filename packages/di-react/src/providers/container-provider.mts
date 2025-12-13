import type { Container } from '@navios/di'
import type { ReactNode } from 'react'

import { createElement } from 'react'

import { ContainerContext } from './context.mjs'

export interface ContainerProviderProps {
  container: Container
  children: ReactNode
}

export function ContainerProvider({
  container,
  children,
}: ContainerProviderProps) {
  return createElement(
    ContainerContext.Provider,
    { value: container },
    children,
  )
}
