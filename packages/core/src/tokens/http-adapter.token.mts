import { InjectionToken } from '@navios/di'

import type { AbstractHttpAdapterInterface } from '../interfaces/index.mjs'

export const HttpAdapterToken =
  InjectionToken.create<AbstractHttpAdapterInterface<any, any, any, any>>(
    'HttpAdapterToken',
  )
