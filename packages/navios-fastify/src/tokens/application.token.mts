import type { FastifyInstance } from 'fastify'

import { InjectionToken } from '../service-locator/index.mjs'

const ApplicationInjectionToken = 'ApplicationInjectionToken'

export const Application = InjectionToken.create<FastifyInstance>(
  ApplicationInjectionToken,
)
