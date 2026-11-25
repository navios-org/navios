import { UseInterceptors as StandardUseInterceptors } from '../interceptors/use-interceptors.mjs'

import type { Interceptor } from '../interceptors/interceptor.mjs'

import { legacy } from './legacy-decorator.mjs'

import type { LegacyAnyDecorator } from './legacy-decorator.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function UseInterceptors(
  ...interceptors: Array<new (...args: any[]) => Interceptor<any, any>>
): LegacyAnyDecorator {
  return legacy(StandardUseInterceptors(...interceptors))
}
