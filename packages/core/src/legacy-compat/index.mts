/**
 * Decorators for projects that compile with `experimentalDecorators`
 * (TypeScript legacy decorators), for example under Bun.
 *
 * Each one adapts the legacy decorator signature and calls the same
 * implementation as the standard decorator of the same name, so behaviour is
 * identical.
 */
import { createClassContext, createMethodContext } from '@navios/di/legacy-compat'

import type { BaseEndpointOptions } from '@navios/builder'
import type { ClassType, InferInput, StandardSchemaV1 } from '@navios/di'

import {
  AttributeFactory as StandardAttributeFactory,
  Controller as StandardController,
  Endpoint as StandardEndpoint,
  Module as StandardModule,
  UseGuards as StandardUseGuards,
  UseInterceptors as StandardUseInterceptors,
} from '../decorators/index.mjs'

import type {
  AttributeApplication,
  ControllerOptions,
  EndpointDeclaration,
  MethodHandlerFunction,
  ModuleOptions,
} from '../decorators/index.mjs'
import type { Guard, Interceptor } from '../routing/compile-route.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export {
  createClassContext,
  createMethodContext,
  Factory,
  Injectable,
} from '@navios/di/legacy-compat'
export type { ControllerOptions, ModuleOptions }

type StandardDecorator = (target: any, context: any) => any

/**
 * Turns a standard decorator into one that accepts the legacy call shapes:
 * `(constructor)`, `(prototype, key, descriptor)` and `(prototype, key)`.
 */
function legacy(decorator: StandardDecorator) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor): any => {
    if (propertyKey === undefined) {
      return decorator(target, createClassContext(target)) ?? target
    }
    if (descriptor && typeof descriptor.value === 'function') {
      const context = createMethodContext(target, propertyKey, descriptor)
      const replaced = decorator(descriptor.value, context)
      if (replaced && replaced !== descriptor.value) {
        descriptor.value = replaced
      }
      return descriptor
    }
    const context = createMethodContext(target, propertyKey, descriptor ?? {})
    decorator(undefined, { ...context, kind: 'field' })
    return undefined
  }
}

export function Controller(options: ControllerOptions = {}) {
  return legacy(StandardController(options)) as <T extends ClassType>(target: T) => T
}

export function Module(options: ModuleOptions = {}) {
  return legacy(StandardModule(options)) as <T extends ClassType>(target: T) => T
}

export function Endpoint<const Config extends BaseEndpointOptions>(
  endpoint: EndpointDeclaration<Config>,
) {
  return legacy(StandardEndpoint(endpoint) as StandardDecorator) as <
    Method extends MethodHandlerFunction<Config>,
  >(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<Method>,
  ) => void
}

type LegacyAnyDecorator = (
  target: any,
  propertyKey?: string | symbol,
  descriptor?: PropertyDescriptor,
) => any

export function UseGuards(...guards: Array<new (...args: any[]) => Guard>): LegacyAnyDecorator {
  return legacy(StandardUseGuards(...guards))
}

export function UseInterceptors(
  ...interceptors: Array<new (...args: any[]) => Interceptor>
): LegacyAnyDecorator {
  return legacy(StandardUseInterceptors(...interceptors))
}

/**
 * An attribute application usable as a legacy decorator and in
 * `handler(endpoint, { attributes: [...] }, fn)`.
 */
export type LegacyAttributeApplication = LegacyAnyDecorator &
  Pick<AttributeApplication, 'token' | 'value'>

export interface LegacyClassAttribute {
  (): LegacyAttributeApplication
  readonly token: symbol
}

export interface LegacyClassSchemaAttribute<Schema extends StandardSchemaV1> {
  (value: InferInput<Schema>): LegacyAttributeApplication
  readonly token: symbol
  readonly schema: Schema
}

function createAttribute(token: symbol): LegacyClassAttribute
function createAttribute<Schema extends StandardSchemaV1>(
  token: symbol,
  schema: Schema,
): LegacyClassSchemaAttribute<Schema>
function createAttribute(token: symbol, schema?: StandardSchemaV1): any {
  const standard: any = schema
    ? StandardAttributeFactory.createAttribute(token, schema)
    : StandardAttributeFactory.createAttribute(token)
  const attribute = (value?: unknown) => {
    const application: AttributeApplication = standard(value)
    return Object.assign(legacy(application), {
      token: application.token,
      value: application.value,
    })
  }
  return Object.assign(attribute, schema ? { token, schema } : { token })
}

/**
 * `AttributeFactory` whose attributes are legacy decorators. Reading
 * (`get`, `getAll`, `has`) is the same as the standard one.
 */
export const AttributeFactory = {
  createAttribute,
  get: StandardAttributeFactory.get,
  getAll: StandardAttributeFactory.getAll,
  has: StandardAttributeFactory.has,
}
