import { InjectionToken } from '@navios/di'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const EndpointAdapterToken =
  InjectionToken.create<AbstractHttpHandlerAdapterInterface>(
    'EndpointAdapterToken',
  )
