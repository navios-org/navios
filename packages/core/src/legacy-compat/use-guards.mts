import { UseGuards as StandardUseGuards } from '../guards/use-guards.mjs'

import type { Guard } from '../guards/guard.mjs'

import { legacy } from './legacy-decorator.mjs'

import type { LegacyAnyDecorator } from './legacy-decorator.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function UseGuards(...guards: Array<new (...args: any[]) => Guard<any>>): LegacyAnyDecorator {
  return legacy(StandardUseGuards(...guards))
}
