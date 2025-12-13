import { createContext } from 'react'

import type { Container } from '@navios/di'

export const ContainerContext = createContext<Container | null>(null)
