import type { FastifyInstance } from 'fastify'

import { InjectionToken } from '@navios/di'

const ApplicationInjectionToken = 'ApplicationInjectionToken'

export const Application = InjectionToken.create<FastifyInstance>(
  ApplicationInjectionToken,
)
