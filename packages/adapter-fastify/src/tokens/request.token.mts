import type { FastifyRequest } from 'fastify'

import { InjectionToken } from '@navios/di'

export const FastifyRequestToken = InjectionToken.create<FastifyRequest>(
  'FastifyRequestToken',
)
