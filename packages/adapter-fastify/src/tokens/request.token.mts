import type { FastifyRequest } from 'fastify'

import { InjectionToken } from '@navios/core'

export const FastifyRequestToken = InjectionToken.create<FastifyRequest>(
  'FastifyRequestToken',
)
