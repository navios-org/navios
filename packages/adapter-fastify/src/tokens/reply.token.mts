import type { FastifyReply } from 'fastify'

import { InjectionToken } from '@navios/core'

export const FastifyReplyToken =
  InjectionToken.create<FastifyReply>('FastifyReplyToken')
