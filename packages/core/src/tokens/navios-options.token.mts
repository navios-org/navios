import { InjectionToken } from '@navios/di'

import type { NaviosApplicationOptions } from '../navios.application.mjs'

export const NaviosOptionsToken =
  InjectionToken.create<NaviosApplicationOptions>('NaviosOptionsToken')
