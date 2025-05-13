import type {
  BoundInjectionToken,
  FactoryContext,
  FactoryInjectionToken,
} from '@navios/core'

import {
  Injectable,
  InjectableType,
  InjectionToken,
  resolveService,
} from '@navios/core'

import type { JwtServiceOptions } from './options/jwt-service.options.mjs'

import { JwtService } from './jwt.service.mjs'
import { JwtServiceOptionsSchema } from './options/jwt-service.options.mjs'

export const JwtServiceToken = InjectionToken.create(
  JwtService,
  JwtServiceOptionsSchema,
)

@Injectable({
  token: JwtServiceToken,
  type: InjectableType.Factory,
})
export class JwtServiceFactory {
  create(ctx: FactoryContext, args: JwtServiceOptions) {
    return resolveService(ctx, JwtService, [args])
  }
}

export function provideJwtService(
  config: JwtServiceOptions | (() => Promise<JwtServiceOptions>),
):
  | BoundInjectionToken<JwtService, typeof JwtServiceOptionsSchema>
  | FactoryInjectionToken<JwtService, typeof JwtServiceOptionsSchema> {
  if (typeof config === 'function') {
    return InjectionToken.factory(JwtServiceToken, config)
  }
  return InjectionToken.bound(JwtServiceToken, config)
}
