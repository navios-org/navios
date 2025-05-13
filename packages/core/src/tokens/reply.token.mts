import type { FastifyReply } from 'fastify'

import { InjectionToken } from '@navios/di'

const ReplyInjectionToken = 'ReplyInjectionToken'

export const Reply = InjectionToken.create<FastifyReply>(ReplyInjectionToken)
