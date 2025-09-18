import type { FastifyReply } from 'fastify'

import { InjectionToken } from '@navios/di'

export const FastifyReplyToken =
  InjectionToken.create<FastifyReply>('FastifyReplyToken')
