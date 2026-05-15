import { Token } from '@navios/di'

import type { AbstractAdapterInterface } from '../interfaces/index.mjs'

export const AdapterToken = Token.create<AbstractAdapterInterface>('AdapterToken')
