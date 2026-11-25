import { UseInterceptors as StandardUseInterceptors } from '../interceptors/use-interceptors.mjs'

import type { InterceptorClass } from '../interceptors/interceptor.mjs'

import { legacy } from './legacy-decorator.mjs'

import type { LegacyAnyDecorator } from './legacy-decorator.mjs'

export function UseInterceptors(...interceptors: InterceptorClass[]): LegacyAnyDecorator {
  return legacy(StandardUseInterceptors(...interceptors))
}
