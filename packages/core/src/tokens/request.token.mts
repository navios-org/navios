import type { FastifyRequest } from 'fastify'

import { InjectionToken } from '@navios/di'

const RequestInjectionToken = 'RequestInjectionToken'

export const Request = InjectionToken.create<FastifyRequest>(
  RequestInjectionToken,
)
