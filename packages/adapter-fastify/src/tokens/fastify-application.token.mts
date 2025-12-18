import { InjectionToken } from '@navios/core'

import type { FastifyApplicationServiceInterface } from '../interfaces/application.interface.mjs'

export const FastifyApplicationServiceToken =
  InjectionToken.create<FastifyApplicationServiceInterface>(
    'FastifyApplicationService',
  )
