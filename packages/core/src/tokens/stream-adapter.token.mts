import { Token } from '@navios/di'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const StreamAdapterToken =
  Token.create<AbstractHttpHandlerAdapterInterface>('StreamAdapterToken')
