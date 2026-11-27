import { classMetadata, describeHandlerClass } from '@navios/core/transport'

import type { ClassType } from '@navios/core'
import type {
  DecoratorMetadata,
  HandlerClassMetadata,
  HandlerClassOptions,
} from '@navios/core/transport'

/** The members are method-form handlers, and extras for field-form handlers. */
export type ControllerMetadata = HandlerClassMetadata

const controllerMetadata = classMetadata<ControllerMetadata>(
  Symbol.for('navios.server.controller'),
  'a controller',
  'Controller',
)

/** @internal */
export function defineControllerMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: HandlerClassOptions,
): void {
  controllerMetadata.define(target, describeHandlerClass(context, options))
}

export function getControllerMetadata(target: ClassType): ControllerMetadata {
  return controllerMetadata.get(target)
}
