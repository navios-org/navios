import { Token } from '@navios/di'

import type { NaviosApplicationOptions } from '../navios.application.mjs'

export const NaviosOptionsToken =
  Token.create<NaviosApplicationOptions>('NaviosOptionsToken')
