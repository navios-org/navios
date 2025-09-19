import type { FastifyInstance } from 'fastify'

import { InjectionToken } from '@navios/di'

export const FastifyServerToken =
  InjectionToken.create<FastifyInstance>('FastifyServerToken')
