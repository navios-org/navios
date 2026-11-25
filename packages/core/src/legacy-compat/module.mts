import type { ClassType } from '@navios/di'

import { Module as StandardModule } from '../modules/module.mjs'

import type { HttpModuleOptions as ModuleOptions } from '../application/http-module-options.mjs'

import { legacy } from './legacy-decorator.mjs'

export function Module(options: ModuleOptions = {}) {
  return legacy(StandardModule(options)) as <T extends ClassType>(target: T) => T
}
