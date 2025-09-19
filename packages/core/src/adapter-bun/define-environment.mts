import type { AnyInjectableType } from '@navios/di'

import { InjectionToken } from '@navios/di'

import {
  EndpointAdapterToken,
  HttpAdapterToken,
  MultipartAdapterToken,
  Request,
  StreamAdapterToken,
} from '../index.mjs'
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
