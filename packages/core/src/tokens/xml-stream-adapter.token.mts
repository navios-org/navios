import { InjectionToken } from '@navios/di'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const XmlStreamAdapterToken =
  InjectionToken.create<AbstractHttpHandlerAdapterInterface>(
    'XmlStreamAdapterToken',
  )
