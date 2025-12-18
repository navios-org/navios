import type { AnyInjectableType } from '@navios/core'

import {
  EndpointAdapterToken,
  HttpAdapterToken,
  InjectionToken,
  MultipartAdapterToken,
  Reply,
  Request,
  StreamAdapterToken,
} from '@navios/core'

import {
  FastifyEndpointAdapterService,
  FastifyMultipartAdapterService,
  FastifyStreamAdapterService,
} from './adapters/index.mjs'
import { FastifyApplicationService } from './services/index.mjs'
import { FastifyReplyToken, FastifyRequestToken } from './tokens/index.mjs'

export function defineFastifyEnvironment() {
  const httpTokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>(
    [
      [EndpointAdapterToken, FastifyEndpointAdapterService],
      [StreamAdapterToken, FastifyStreamAdapterService],
      [MultipartAdapterToken, FastifyMultipartAdapterService],
      [HttpAdapterToken, FastifyApplicationService],
      [Request, FastifyRequestToken],
      [Reply, FastifyReplyToken],
    ],
  )
  return {
    httpTokens,
  }
}
