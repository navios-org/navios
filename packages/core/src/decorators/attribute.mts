import type { InferInput, InferOutput, StandardSchemaV1 } from '@navios/di'

import { classAttributes, memberMetadata } from '../metadata/metadata.mjs'

import type { RouteInfo } from '../routing/types.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

type AttributeContext =
  | ClassDecoratorContext
  | ClassMethodDecoratorContext
  | ClassFieldDecoratorContext

/**
 * The result of calling an attribute. It is a decorator for a module, a
 * controller, a handler method or a handler field, and it can also be passed
 * in `handler(endpoint, { attributes: [...] }, fn)`.
 */
export interface AttributeApplication {
  (target: any, context: AttributeContext): any
  readonly token: symbol
  readonly value: unknown
}

export interface ClassAttribute {
  (): AttributeApplication
  readonly token: symbol
}

export interface ClassSchemaAttribute<Schema extends StandardSchemaV1> {
  (value: InferInput<Schema>): AttributeApplication
  readonly token: symbol
  readonly schema: Schema
}

function apply(token: symbol, value: unknown): AttributeApplication {
  const decorator = (target: any, context: AttributeContext) => {
    if (context.kind === 'class') {
      classAttributes(context).set(token, value)
    } else if (context.kind === 'method' || context.kind === 'field') {
      if (typeof context.name !== 'string') {
        throw new Error('[Navios] Attributes cannot be applied to symbol-named members')
      }
      memberMetadata(context, context.name).attributes.set(token, value)
    } else {
      throw new Error('[Navios] Attributes can only be applied to classes, methods and fields')
    }
    return context.kind === 'field' ? undefined : target
  }
  return Object.assign(decorator, { token, value })
}

type AttributeSource = RouteInfo | { attributes: ReadonlyMap<symbol, unknown> }

function layers(source: AttributeSource): ReadonlyMap<symbol, unknown>[] {
  const attributes = source.attributes
  if (attributes instanceof Map) {
    return [attributes]
  }
  const route = attributes as RouteInfo['attributes']
  // Most specific first.
  return [route.handler, route.controller, route.module]
}

/**
 * Creates and reads attributes: typed metadata attached to modules,
 * controllers and handlers.
 *
 * ```ts
 * export const Public = AttributeFactory.createAttribute(Symbol.for('Public'))
 * export const Roles = AttributeFactory.createAttribute(Symbol.for('Roles'), z.array(z.string()))
 *
 * if (AttributeFactory.has(Public, ctx.route)) return true
 * const roles = AttributeFactory.get(Roles, ctx.route) // string[] | null
 * ```
 */
export class AttributeFactory {
  static createAttribute(token: symbol): ClassAttribute
  static createAttribute<Schema extends StandardSchemaV1>(
    token: symbol,
    schema: Schema,
  ): ClassSchemaAttribute<Schema>
  static createAttribute(token: symbol, schema?: StandardSchemaV1): any {
    const attribute = (value?: unknown) => {
      if (!schema) {
        return apply(token, true)
      }
      const result = schema['~standard'].validate(value)
      if (result instanceof Promise) {
        result.catch(() => {})
        throw new Error(
          `[Navios] Attribute ${token.toString()} must use a schema that validates synchronously`,
        )
      }
      if (result.issues) {
        throw new Error(
          `[Navios] Invalid value for attribute ${token.toString()}: ${result.issues
            .map((issue) => issue.message)
            .join('; ')}`,
        )
      }
      return apply(token, result.value)
    }
    return Object.assign(attribute, schema ? { token, schema } : { token })
  }

  /**
   * The attribute's value on a route: the handler's, else the controller's,
   * else the module's. `null` when none has it.
   */
  static get(attribute: ClassAttribute, source: AttributeSource): true | null
  static get<Schema extends StandardSchemaV1>(
    attribute: ClassSchemaAttribute<Schema>,
    source: AttributeSource,
  ): InferOutput<Schema> | null
  static get(attribute: { token: symbol }, source: AttributeSource): unknown {
    for (const layer of layers(source)) {
      if (layer.has(attribute.token)) {
        return layer.get(attribute.token)
      }
    }
    return null
  }

  /**
   * Every value of the attribute on a route, most specific first.
   */
  static getAll(attribute: ClassAttribute, source: AttributeSource): true[]
  static getAll<Schema extends StandardSchemaV1>(
    attribute: ClassSchemaAttribute<Schema>,
    source: AttributeSource,
  ): InferOutput<Schema>[]
  static getAll(attribute: { token: symbol }, source: AttributeSource): unknown[] {
    const values: unknown[] = []
    for (const layer of layers(source)) {
      if (layer.has(attribute.token)) {
        values.push(layer.get(attribute.token))
      }
    }
    return values
  }

  static has(attribute: { token: symbol }, source: AttributeSource): boolean {
    return layers(source).some((layer) => layer.has(attribute.token))
  }
}
