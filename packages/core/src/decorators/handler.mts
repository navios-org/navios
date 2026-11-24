import type { BaseEndpointOptions } from '@navios/builder'
import type { ClassType } from '@navios/di'

import type { RouteEndpointConfig } from '../routing/types.mjs'

import type { AttributeApplication } from './attribute.mjs'
import type { AnyHandlerFunction, EndpointDeclaration, HandlerFunction } from './handler-types.mjs'

const handlerBrand: unique symbol = Symbol.for('navios.core.handler')

export interface HandlerOptions {
  guards?: ClassType[]
  interceptors?: ClassType[]
  /**
   * Attribute values, as returned by calling an attribute: `[Public()]`.
   * Attributes from `@navios/core/legacy-compat` are accepted as well.
   */
  attributes?: Array<Pick<AttributeApplication, 'token' | 'value'>>
}

/**
 * A handler defined as a class field with `handler()`.
 */
export interface FieldHandler<Config extends BaseEndpointOptions = BaseEndpointOptions> {
  readonly [handlerBrand]: true
  readonly config: Config
  readonly options: HandlerOptions
  readonly invoke: HandlerFunction<Config>
}

/**
 * Defines a handler as a controller field. Parameter and return types come
 * from the endpoint declaration, so nothing needs annotating.
 *
 * ```ts
 * @Controller()
 * export class UsersController {
 *   private readonly users = inject(UsersService)
 *
 *   getUser = handler(getUser, async ({ urlParams }, ctx) => {
 *     const user = await this.users.findById(urlParams.id)
 *     return user ?? reply(404, { message: 'User not found' })
 *   })
 * }
 * ```
 */
export function handler<const Config extends BaseEndpointOptions>(
  endpoint: EndpointDeclaration<Config>,
  fn: HandlerFunction<Config>,
): FieldHandler<Config>
export function handler<const Config extends BaseEndpointOptions>(
  endpoint: EndpointDeclaration<Config>,
  options: HandlerOptions,
  fn: HandlerFunction<Config>,
): FieldHandler<Config>
export function handler(
  endpoint: EndpointDeclaration,
  optionsOrFn: HandlerOptions | AnyHandlerFunction,
  maybeFn?: AnyHandlerFunction,
): FieldHandler {
  const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn
  if (typeof fn !== 'function') {
    throw new Error('[Navios] handler() needs a function')
  }
  return {
    [handlerBrand]: true,
    config: endpoint.config,
    options: typeof optionsOrFn === 'function' ? {} : optionsOrFn,
    invoke: fn as HandlerFunction<BaseEndpointOptions>,
  }
}

export function isFieldHandler(value: unknown): value is FieldHandler {
  return typeof value === 'object' && value !== null && handlerBrand in value
}

/** @internal */
export function endpointConfig(endpoint: EndpointDeclaration): RouteEndpointConfig {
  return endpoint.config as unknown as RouteEndpointConfig
}
