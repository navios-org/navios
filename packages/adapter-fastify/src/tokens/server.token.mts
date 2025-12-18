import type { FastifyInstance } from 'fastify'

import { InjectionToken } from '@navios/core'

export const FastifyServerToken =
  InjectionToken.create<FastifyInstance>('FastifyServerToken')
