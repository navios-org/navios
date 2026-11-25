import type { ClassType } from '@navios/di'

import { Module as StandardModule } from '../modules/module.mjs'

import type { ModuleOptions } from '../modules/module-options.mjs'

import { legacy } from './legacy-decorator.mjs'

export function Module(options: ModuleOptions = {}) {
  return legacy(StandardModule(options)) as <T extends ClassType>(target: T) => T
}
