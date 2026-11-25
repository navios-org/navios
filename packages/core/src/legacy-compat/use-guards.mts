import { UseGuards as StandardUseGuards } from '../guards/use-guards.mjs'

import type { GuardClass } from '../guards/guard.mjs'

import { legacy } from './legacy-decorator.mjs'

import type { LegacyAnyDecorator } from './legacy-decorator.mjs'

export function UseGuards(...guards: GuardClass[]): LegacyAnyDecorator {
  return legacy(StandardUseGuards(...guards))
}
