import { Token } from '@navios/di'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const XmlStreamAdapterToken =
  Token.create<AbstractHttpHandlerAdapterInterface>('XmlStreamAdapterToken')
