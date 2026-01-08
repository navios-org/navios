import type { ClassType } from '@navios/di'
import { createClassContext, createMethodContext } from '@navios/di/legacy-compat'
import type { z, ZodType } from 'zod/v4'

import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '../metadata/index.mjs'

import {
  getControllerMetadata,
  getEndpointMetadata,
  getModuleMetadata,
  hasControllerMetadata,
  hasModuleMetadata,
} from '../metadata/index.mjs'
import {
  getManagedMetadata,
  hasManagedMetadata,
} from '../metadata/navios-managed.metadata.mjs'

/**
 * Type for a legacy class/method attribute decorator without a value.
 *
 * Attributes are custom metadata decorators that can be applied to modules,
 * controllers, and endpoints.
 */
export type LegacyClassAttribute = {
  (): ClassDecorator & MethodDecorator
  token: symbol
}

/**
 * Type for a legacy class/method attribute decorator with a validated value.
 *
 * @typeParam S - The Zod schema type for validation
 */
export type LegacyClassSchemaAttribute<S extends ZodType> = {
  (value: z.input<S>): ClassDecorator & MethodDecorator
  token: symbol
  schema: ZodType
}

/**
 * Legacy-compatible factory for creating custom attribute decorators.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * Attributes allow you to add custom metadata to modules, controllers, and endpoints.
 * This is useful for cross-cutting concerns like rate limiting, caching, API versioning, etc.
 *
 * @example
 * ```typescript
 * // Create a simple boolean attribute
 * const Public = LegacyAttributeFactory.createAttribute(Symbol.for('Public'))
 *
 * // Use it as a decorator
 * @Controller()
 * @Public()
 * export class PublicController { }
 *
 * // Check if attribute exists
 * if (LegacyAttributeFactory.has(Public, controllerMetadata)) {
 *   // Skip authentication
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Create an attribute with a validated value
 * const RateLimit = LegacyAttributeFactory.createAttribute(
 *   Symbol.for('RateLimit'),
 *   z.object({ requests: z.number(), window: z.number() })
 * )
 *
 * // Use it with a value
 * @Endpoint(apiEndpoint)
 * @RateLimit({ requests: 100, window: 60000 })
 * async handler() { }
 *
 * // Get the value
 * const limit = LegacyAttributeFactory.get(RateLimit, endpointMetadata)
 * // limit is typed as { requests: number, window: number } | null
 * ```
 */
export class LegacyAttributeFactory {
  /**
   * Creates a simple attribute decorator without a value.
   *
   * @param token - A unique symbol to identify this attribute
   * @returns A decorator function that can be applied to classes or methods
   *
   * @example
   * ```typescript
   * const Public = LegacyAttributeFactory.createAttribute(Symbol.for('Public'))
   *
   * @Public()
   * @Controller()
   * export class PublicController { }
   * ```
   */
  static createAttribute(token: symbol): LegacyClassAttribute
  /**
   * Creates an attribute decorator with a validated value.
   *
   * @param token - A unique symbol to identify this attribute
   * @param schema - A Zod schema to validate the attribute value
   * @returns A decorator function that accepts a value and can be applied to classes or methods
   *
   * @example
   * ```typescript
   * const RateLimit = LegacyAttributeFactory.createAttribute(
   *   Symbol.for('RateLimit'),
   *   z.object({ requests: z.number(), window: z.number() })
   * )
   *
   * @RateLimit({ requests: 100, window: 60000 })
   * @Endpoint(apiEndpoint)
   * async handler() { }
   * ```
   */
  static createAttribute<T extends ZodType>(
    token: symbol,
    schema: T,
  ): LegacyClassSchemaAttribute<T>

  static createAttribute(token: symbol, schema?: ZodType) {
    const res = (value?: unknown) => {
      // Return a decorator that can handle both class and method targets
      function decorator(target: any): any
      function decorator(
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
      ): PropertyDescriptor
      function decorator(
        target: any,
        propertyKey?: string | symbol,
        descriptor?: PropertyDescriptor,
      ): any {
        const isMethodDecorator =
          propertyKey !== undefined && descriptor !== undefined

        if (isMethodDecorator) {
          // Method decorator - apply to endpoint
          const context = createMethodContext(target, propertyKey, descriptor)
          const metadata = getEndpointMetadata(descriptor.value, context)

          if (schema) {
            const validatedValue = schema.safeParse(value)
            if (!validatedValue.success) {
              throw new Error(
                `[Navios] Invalid value for attribute ${token.toString()}: ${validatedValue.error}`,
              )
            }
            metadata.customAttributes.set(token, validatedValue.data)
          } else {
            metadata.customAttributes.set(token, true)
          }
          return descriptor
        } else {
          // Class decorator
          const isController = hasControllerMetadata(target as ClassType)
          const isModule = hasModuleMetadata(target as ClassType)
          const isManaged = hasManagedMetadata(target as ClassType)

          if (!isController && !isModule && !isManaged) {
            throw new Error(
              '[Navios] Attribute can only be applied to classes with @Controller, @Module, or other Navios-managed decorators',
            )
          }

          const context = createClassContext(target)
          const metadata = isController
            ? getControllerMetadata(target, context)
            : isModule
              ? getModuleMetadata(target, context)
              : isManaged
                ? getManagedMetadata(target)!
                : null

          if (!metadata) {
            throw new Error(
              '[Navios] Could not determine metadata for attribute target',
            )
          }

          if (schema) {
            const validatedValue = schema.safeParse(value)
            if (!validatedValue.success) {
              throw new Error(
                `[Navios] Invalid value for attribute ${token.toString()}: ${validatedValue.error}`,
              )
            }
            metadata.customAttributes.set(token, validatedValue.data)
          } else {
            metadata.customAttributes.set(token, true)
          }
          return target
        }
      }
      return decorator
    }
    res.token = token
    if (schema) {
      res.schema = schema
    }
    return res
  }

  /**
   * Gets the value of an attribute from metadata.
   *
   * Returns `null` if the attribute is not present.
   * For simple attributes (without values), returns `true` if present.
   *
   * @param attribute - The attribute decorator
   * @param target - The metadata object (module, controller, or handler)
   * @returns The attribute value, `true` for simple attributes, or `null` if not found
   *
   * @example
   * ```typescript
   * const isPublic = LegacyAttributeFactory.get(Public, controllerMetadata)
   * // isPublic is true | null
   *
   * const rateLimit = LegacyAttributeFactory.get(RateLimit, endpointMetadata)
   * // rateLimit is { requests: number, window: number } | null
   * ```
   */
  static get(
    attribute: LegacyClassAttribute,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): true | null
  static get<T extends ZodType>(
    attribute: LegacyClassSchemaAttribute<T>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): z.output<T> | null
  static get(
    attribute: LegacyClassAttribute | LegacyClassSchemaAttribute<any>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ) {
    return target.customAttributes.get(attribute.token) ?? null
  }

  /**
   * Gets all values of an attribute from metadata (useful when an attribute can appear multiple times).
   *
   * Returns `null` if the attribute is not present.
   *
   * @param attribute - The attribute decorator
   * @param target - The metadata object (module, controller, or handler)
   * @returns An array of attribute values, or `null` if not found
   *
   * @example
   * ```typescript
   * const tags = LegacyAttributeFactory.getAll(Tag, endpointMetadata)
   * // tags is string[] | null
   * ```
   */
  static getAll(
    attribute: LegacyClassAttribute,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): Array<true> | null
  static getAll<T extends ZodType>(
    attribute: LegacyClassSchemaAttribute<T>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): Array<z.output<T>> | null
  static getAll(
    attribute: LegacyClassAttribute | LegacyClassSchemaAttribute<any>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ) {
    const values = Array.from(target.customAttributes.entries())
      .filter(([key]) => key === attribute.token)
      .map(([, value]) => value)
    return values.length > 0 ? values : null
  }

  /**
   * Gets the last value of an attribute from an array of metadata objects.
   *
   * Searches from the end of the array backwards, useful for finding the most
   * specific attribute value (e.g., endpoint-level overrides module-level).
   *
   * @param attribute - The attribute decorator
   * @param target - An array of metadata objects (typically [module, controller, handler])
   * @returns The last attribute value found, or `null` if not found
   *
   * @example
   * ```typescript
   * // Check attribute hierarchy: endpoint -> controller -> module
   * const rateLimit = LegacyAttributeFactory.getLast(RateLimit, [
   *   moduleMetadata,
   *   controllerMetadata,
   *   endpointMetadata
   * ])
   * ```
   */
  static getLast(
    attribute: LegacyClassAttribute,
    target: (ModuleMetadata | ControllerMetadata | HandlerMetadata<any>)[],
  ): true | null
  static getLast<T extends ZodType>(
    attribute: LegacyClassSchemaAttribute<T>,
    target: (ModuleMetadata | ControllerMetadata | HandlerMetadata<any>)[],
  ): z.output<T> | null
  static getLast(
    attribute: LegacyClassAttribute | LegacyClassSchemaAttribute<any>,
    target: (ModuleMetadata | ControllerMetadata | HandlerMetadata<any>)[],
  ) {
    for (let i = target.length - 1; i >= 0; i--) {
      const value = target[i].customAttributes.get(attribute.token)
      if (value) {
        return value
      }
    }
    return null
  }

  /**
   * Checks if an attribute is present on the metadata object.
   *
   * @param attribute - The attribute decorator
   * @param target - The metadata object (module, controller, or handler)
   * @returns `true` if the attribute is present, `false` otherwise
   *
   * @example
   * ```typescript
   * if (LegacyAttributeFactory.has(Public, controllerMetadata)) {
   *   // Skip authentication
   * }
   * ```
   */
  static has(
    attribute: LegacyClassAttribute,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): boolean
  static has<T extends ZodType>(
    attribute: LegacyClassSchemaAttribute<T>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): boolean
  static has(
    attribute: LegacyClassAttribute | LegacyClassSchemaAttribute<any>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ) {
    return target.customAttributes.has(attribute.token)
  }
}

// Re-export as AttributeFactory for convenience
export { LegacyAttributeFactory as AttributeFactory }
