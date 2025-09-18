import { InjectionToken } from '@navios/di'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const StreamAdapterToken =
  InjectionToken.create<AbstractHttpHandlerAdapterInterface>(
    'StreamAdapterToken',
  )
