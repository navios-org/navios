import { Token } from '@navios/di'

import type { AbstractHttpAdapterInterface } from '../interfaces/index.mjs'

export const HttpAdapterToken =
  Token.create<AbstractHttpAdapterInterface>('HttpAdapterToken')
