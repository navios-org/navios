import type { FastifyRequest } from 'fastify'

import { InjectionToken } from '../service-locator/index.mjs'

const RequestInjectionToken = 'RequestInjectionToken'

export const Request = InjectionToken.create<FastifyRequest>(
  RequestInjectionToken,
)
