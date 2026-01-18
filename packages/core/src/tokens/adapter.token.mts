import { InjectionToken } from '@navios/di'

import type { AbstractAdapterInterface } from '../interfaces/index.mjs'

export const AdapterToken = InjectionToken.create<AbstractAdapterInterface>('AdapterToken')
