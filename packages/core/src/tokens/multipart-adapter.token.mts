import { Token } from '@navios/di'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const MultipartAdapterToken =
  Token.create<AbstractHttpHandlerAdapterInterface>('MultipartAdapterToken')
