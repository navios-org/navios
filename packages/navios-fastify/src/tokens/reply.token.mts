import type { FastifyReply } from 'fastify'

import { InjectionToken } from '../service-locator/index.mjs'

const ReplyInjectionToken = 'ReplyInjectionToken'

export const Reply = InjectionToken.create<FastifyReply>(ReplyInjectionToken)
