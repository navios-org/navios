import { InjectionToken } from '@navios/core'

import type { BunApplicationServiceInterface } from '../interfaces/application.interface.mjs'

export const BunApplicationServiceToken =
  InjectionToken.create<BunApplicationServiceInterface>('BunApplicationService')
