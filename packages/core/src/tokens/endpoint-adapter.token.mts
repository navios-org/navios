import { Token } from '@navios/di'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const EndpointAdapterToken =
  Token.create<AbstractHttpHandlerAdapterInterface>('EndpointAdapterToken')
