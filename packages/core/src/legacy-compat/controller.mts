import type { ClassType } from '@navios/di'

import { Controller as StandardController } from '../controllers/controller.mjs'

import type { ControllerOptions } from '../controllers/controller.mjs'

import { legacy } from './legacy-decorator.mjs'

export function Controller(options: ControllerOptions = {}) {
  return legacy(StandardController(options)) as <T extends ClassType>(target: T) => T
}
