import type { BoundInjectionToken, FactoryInjectionToken } from '@navios/core'

import { InjectionToken } from '@navios/core'

import type { JwtServiceOptions } from './options/jwt-service.options.mjs'

import { JwtService, JwtServiceToken } from './jwt.service.mjs'
import { JwtServiceOptionsSchema } from './options/jwt-service.options.mjs'

export function provideJwtService(
  config: JwtServiceOptions,
): BoundInjectionToken<JwtService, typeof JwtServiceOptionsSchema>
export function provideJwtService(
  config: () => Promise<JwtServiceOptions>,
): FactoryInjectionToken<JwtService, typeof JwtServiceOptionsSchema>
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
