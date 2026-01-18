import { InjectionToken } from '@navios/di'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const MultipartAdapterToken =
  InjectionToken.create<AbstractHttpHandlerAdapterInterface>('MultipartAdapterToken')
