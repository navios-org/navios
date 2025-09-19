import { InjectionToken } from '@navios/di'

import type { FastifyApplicationServiceInterface } from '../interfaces/application.interface.mjs'

export const FastifyApplicationServiceToken =
  InjectionToken.create<FastifyApplicationServiceInterface>(
    'FastifyApplicationService',
  )
