import { describeHandlerClass } from '@navios/core/transport'

import type {
  DecoratorMetadata,
  HandlerClassMetadata,
  HandlerClassOptions,
} from '@navios/core/transport'
import type { ClassType } from '@navios/di'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The members are method-form handlers, and extras for field-form handlers. */
export type ControllerMetadata = HandlerClassMetadata

const ControllerMetadataKey = Symbol.for('navios.server.controller')

/** @internal */
export function defineControllerMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: HandlerClassOptions,
): void {
  Object.defineProperty(target, ControllerMetadataKey, {
    value: describeHandlerClass(context, options),
    configurable: true,
    enumerable: false,
  })
}

export function getControllerMetadata(target: ClassType): ControllerMetadata {
  const metadata = Object.hasOwn(target, ControllerMetadataKey)
    ? ((target as any)[ControllerMetadataKey] as ControllerMetadata)
    : undefined
  if (!metadata) {
    throw new Error(
      `[Navios] ${target.name} is not a controller. Make sure it is decorated with @Controller.`,
    )
  }
  return metadata
}
