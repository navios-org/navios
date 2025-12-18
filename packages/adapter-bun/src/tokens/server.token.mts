import type { Server } from 'bun'

import { InjectionToken } from '@navios/core'

export const BunServerToken =
  InjectionToken.create<Server<undefined>>('BunServerToken')
