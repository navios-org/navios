import type { AnyInjectableType } from '@navios/core'

import {
  EndpointAdapterToken,
  HttpAdapterToken,
  InjectionToken,
  MultipartAdapterToken,
  Request,
  StreamAdapterToken,
} from '@navios/core'

import {
  BunEndpointAdapterService,
  BunMultipartAdapterService,
  BunStreamAdapterService,
} from './adapters/index.mjs'
import { BunApplicationService } from './services/index.mjs'
import { BunRequestToken } from './tokens/index.mjs'

export function defineBunEnvironment() {
  const httpTokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>(
    [
      [EndpointAdapterToken, BunEndpointAdapterService],
      [StreamAdapterToken, BunStreamAdapterService],
      [MultipartAdapterToken, BunMultipartAdapterService], // Use stream for multipart
      [HttpAdapterToken, BunApplicationService],
      [Request, BunRequestToken],
    ],
  )
  return {
    httpTokens,
  }
}
