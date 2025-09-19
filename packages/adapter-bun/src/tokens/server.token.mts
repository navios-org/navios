import type { Server } from 'bun'

import { InjectionToken } from '@navios/di'

export const BunServerToken = InjectionToken.create<Server>('BunServerToken')
