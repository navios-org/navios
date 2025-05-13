import type { z, ZodType } from 'zod'

import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from './metadata/index.mjs'
import type { ClassType } from './service-locator/index.mjs'

import {
  getControllerMetadata,
  getEndpointMetadata,
  getModuleMetadata,
  hasControllerMetadata,
  hasModuleMetadata,
} from './metadata/index.mjs'

export type ClassAttribute = (() => <T>(
  target: T,
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
) => T) & {
  token: symbol
}
export type ClassSchemaAttribute<T extends ZodType> = ((
  value: z.input<T>,
) => <T>(
  target: T,
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
) => T) & {
  token: symbol
  schema: ZodType
}

export class AttributeFactory {
  static createAttribute(token: symbol): ClassAttribute
  static createAttribute<T extends ZodType>(
    token: symbol,
    schema: T,
  ): ClassSchemaAttribute<T>
  static createAttribute(token: symbol, schema?: ZodType) {
    const res =
      (value?: unknown) =>
      (
        target: any,
        context: ClassDecoratorContext | ClassMethodDecoratorContext,
      ) => {
        if (context.kind !== 'class' && context.kind !== 'method') {
          throw new Error(
            '[Navios] Attribute can only be applied to classes or methods',
          )
        }
        const isController =
          context.kind === 'class' && hasControllerMetadata(target as ClassType)
        const isModule =
          context.kind === 'class' && hasModuleMetadata(target as ClassType)
        if (context.kind === 'class' && !isController && !isModule) {
          throw new Error(
            '[Navios] Attribute can only be applied to classes with @Controller or @Module decorators',
          )
        }
        let metadata =
          context.kind === 'class'
            ? isController
              ? getControllerMetadata(target as any, context)
              : getModuleMetadata(target as any, context)
            : getEndpointMetadata(target, context)
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
    res.token = token
    if (schema) {
      res.schema = schema
    }
    return res
  }

  static get(
    attribute: ClassAttribute,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): true | null
  static get<T extends ZodType>(
    attribute: ClassSchemaAttribute<T>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): z.output<T> | null
  static get(
    attribute: ClassAttribute | ClassSchemaAttribute<any>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ) {
    return target.customAttributes.get(attribute.token) ?? null
  }

  static getAll(
    attribute: ClassAttribute,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): Array<true> | null
  static getAll<T extends ZodType>(
    attribute: ClassSchemaAttribute<T>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): Array<z.output<T>> | null
  static getAll(
    attribute: ClassAttribute | ClassSchemaAttribute<any>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ) {
    const values = Array.from(target.customAttributes.entries())
      .filter(([key]) => key === attribute.token)
      .map(([, value]) => value)
    return values.length > 0 ? values : null
  }

  static getLast(
    attribute: ClassAttribute,
    target: (ModuleMetadata | ControllerMetadata | HandlerMetadata<any>)[],
  ): true | null
  static getLast<T extends ZodType>(
    attribute: ClassSchemaAttribute<T>,
    target: (ModuleMetadata | ControllerMetadata | HandlerMetadata<any>)[],
  ): z.output<T> | null
  static getLast(
    attribute: ClassAttribute | ClassSchemaAttribute<any>,
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

  static has(
    attribute: ClassAttribute,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): boolean
  static has<T extends ZodType>(
    attribute: ClassSchemaAttribute<T>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ): boolean
  static has(
    attribute: ClassAttribute | ClassSchemaAttribute<any>,
    target: ModuleMetadata | ControllerMetadata | HandlerMetadata<any>,
  ) {
    return target.customAttributes.has(attribute.token)
  }
}
