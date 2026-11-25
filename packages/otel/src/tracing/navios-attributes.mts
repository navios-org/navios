import type { AttributeValue } from '@opentelemetry/api'

/**
 * Navios-specific attributes for framework context.
 */
export const NaviosAttributes = {
  CONTROLLER: 'navios.controller',
  HANDLER: 'navios.handler',
  MODULE: 'navios.module',
  GUARD: 'navios.guard',
  SERVICE: 'navios.service',
  METHOD: 'navios.method',
} as const

/**
 * Creates Navios-specific attributes.
 *
 * @param context - Navios context information
 * @returns Record of attribute key-value pairs
 */
export function createNaviosAttributes(context: {
  controller?: string
  handler?: string
  module?: string
  guard?: string
  service?: string
  method?: string
}): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {}

  if (context.controller) {
    attributes[NaviosAttributes.CONTROLLER] = context.controller
  }
  if (context.handler) {
    attributes[NaviosAttributes.HANDLER] = context.handler
  }
  if (context.module) {
    attributes[NaviosAttributes.MODULE] = context.module
  }
  if (context.guard) {
    attributes[NaviosAttributes.GUARD] = context.guard
  }
  if (context.service) {
    attributes[NaviosAttributes.SERVICE] = context.service
  }
  if (context.method) {
    attributes[NaviosAttributes.METHOD] = context.method
  }

  return attributes
}
