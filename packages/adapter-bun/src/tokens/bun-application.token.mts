import { InjectionToken } from '@navios/di'

import type { BunApplicationServiceInterface } from '../interfaces/application.interface.mjs'

export const BunApplicationServiceToken =
  InjectionToken.create<BunApplicationServiceInterface>('BunApplicationService')
