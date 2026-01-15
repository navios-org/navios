import { InjectionToken } from '@navios/di'

import type { BunControllerAdapterService } from '../services/controller-adapter.service.mjs'

/**
 * Injection token for BunControllerAdapterService.
 *
 * This token allows overriding the default controller adapter with custom
 * implementations (e.g., for tracing or other middleware-like behavior).
 */
export const BunControllerAdapterToken =
  InjectionToken.create<BunControllerAdapterService>('BunControllerAdapterService')
