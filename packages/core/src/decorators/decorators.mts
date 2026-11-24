import { InjectableScope, registerInjectable } from '@navios/di'

import type { BaseEndpointOptions } from '@navios/builder'
import type { ClassType, Provider } from '@navios/di'

import {
  classGuards,
  classInterceptors,
  defineControllerMetadata,
  defineModuleMetadata,
  memberMetadata,
} from '../metadata/metadata.mjs'

import type { RequestValueClass } from '../context/context-key.mjs'
import type { Guard, Interceptor } from '../routing/compile-route.mjs'

import { endpointConfig } from './handler.mjs'

import type { EndpointDeclaration, HandlerFunction } from './handler-types.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ControllerOptions {
  guards?: ClassType[]
  interceptors?: ClassType[]
  /** Attribute values for the whole controller: `[Public()]`. */
  attributes?: AttributeValue[]
}

/** An attribute value as returned by calling an attribute. */
export type AttributeValue = { readonly token: symbol; readonly value: unknown }

function applyAttributes(
  target: Map<symbol, unknown>,
  attributes: AttributeValue[] | undefined,
): void {
  for (const attribute of attributes ?? []) {
    target.set(attribute.token, attribute.value)
  }
}

/**
 * Marks a class as a controller. Controllers are singletons: per-request
 * data comes from the `RequestContext` passed to each handler.
 */
export function Controller(options: ControllerOptions = {}) {
  return <T extends ClassType>(target: T, context: ClassDecoratorContext): T => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Controller can only be used on classes.')
    }
    applyAttributes(
      defineControllerMetadata(target, context, options).attributes,
      options.attributes,
    )
    registerInjectable(target, { scope: InjectableScope.Singleton })
    return target
  }
}

/**
 * Registers a class as a controller without decorator syntax. Meant for
 * library code that is built without a decorator transform; its handlers are
 * `handler()` fields.
 *
 * ```ts
 * class DocsController {
 *   spec = handler(specEndpoint, () => document)
 * }
 * registerController(DocsController)
 * ```
 */
export function registerController<T extends ClassType>(
  target: T,
  options: ControllerOptions = {},
): T {
  applyAttributes(
    defineControllerMetadata(target, { metadata: {} }, options).attributes,
    options.attributes,
  )
  registerInjectable(target, { scope: InjectableScope.Singleton })
  return target
}

export interface ModuleOptions {
  /** Path prefix for every route of this module and of the modules it imports. */
  prefix?: string
  imports?: ClassType[]
  controllers?: ClassType[]
  /** Guards for every route of this module and of the modules it imports. */
  guards?: ClassType[]
  interceptors?: ClassType[]
  /** Providers for the whole application (modules do not encapsulate them). */
  providers?: Provider[]
  /**
   * Request values to build while the application initialises. Needed for a
   * value that has, directly or through a service, a dependency with an
   * asynchronous initialiser that nothing else builds at boot; listing a
   * value also turns an error in its construction into an error of `init()`.
   */
  requestValues?: RequestValueClass[]
  /** Attribute values for every route of this module: `[Public()]`. */
  attributes?: AttributeValue[]
}

/**
 * Marks a class as a module: a group of routes with a shared prefix, guards
 * and interceptors.
 */
export function Module(options: ModuleOptions = {}) {
  return <T extends ClassType>(target: T, context: ClassDecoratorContext): T => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Module can only be used on classes.')
    }
    applyAttributes(defineModuleMetadata(target, context, options).attributes, options.attributes)
    registerInjectable(target, { scope: InjectableScope.Singleton })
    return target
  }
}

/**
 * Registers a class as a module without decorator syntax.
 */
export function registerModule<T extends ClassType>(target: T, options: ModuleOptions = {}): T {
  applyAttributes(
    defineModuleMetadata(target, { metadata: {} }, options).attributes,
    options.attributes,
  )
  registerInjectable(target, { scope: InjectableScope.Singleton })
  return target
}

/**
 * Serves a builder endpoint with a controller method. The body kind, response
 * kind and status codes all come from the declaration.
 *
 * TypeScript cannot infer a method's parameters from a decorator, so the
 * parameter type is written with `HandlerParams<typeof endpoint>`. The field
 * form, `handler(endpoint, fn)`, needs no annotation.
 */
export function Endpoint<const Config extends BaseEndpointOptions>(
  endpoint: EndpointDeclaration<Config>,
) {
  return <Method extends HandlerFunction<Config> | (() => ReturnType<HandlerFunction<Config>>)>(
    target: Method,
    context: ClassMethodDecoratorContext,
  ): Method => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] @Endpoint can only be used on methods.')
    }
    if (typeof context.name !== 'string') {
      throw new Error('[Navios] @Endpoint cannot be used on symbol-named methods.')
    }
    const member = memberMetadata(context, context.name)
    const config = endpointConfig(endpoint)
    if (member.config !== null && member.config !== config) {
      throw new Error(
        `[Navios] ${context.name} already serves ${member.config.method} ${member.config.url}; ` +
          `a method can serve one endpoint.`,
      )
    }
    member.config = config
    return target
  }
}

type GuardClass = new (...args: any[]) => Guard
type InterceptorClass = new (...args: any[]) => Interceptor

type AnyMemberContext =
  | ClassDecoratorContext
  | ClassMethodDecoratorContext
  | ClassFieldDecoratorContext

function attach(
  kind: 'guards' | 'interceptors',
  classes: ClassType[],
  name: string,
): (target: any, context: AnyMemberContext) => any {
  return (target, context) => {
    if (context.kind === 'class') {
      const list = kind === 'guards' ? classGuards(context) : classInterceptors(context)
      for (const cls of classes) {
        if (!list.includes(cls)) {
          list.push(cls)
        }
      }
      return target
    }
    if (context.kind !== 'method' && context.kind !== 'field') {
      throw new Error(`[Navios] @${name} can only be used on classes, methods and fields.`)
    }
    if (typeof context.name !== 'string') {
      throw new Error(`[Navios] @${name} cannot be used on symbol-named members.`)
    }
    const list = memberMetadata(context, context.name)[kind]
    for (const cls of classes) {
      if (!list.includes(cls)) {
        list.push(cls)
      }
    }
    return context.kind === 'field' ? undefined : target
  }
}

/**
 * Adds guards to a module, a controller or a handler. Guards run in the
 * order module, controller, handler, and within one level in the order given.
 *
 * On a class, place it above `@Controller` / `@Module`.
 */
export function UseGuards(...guards: GuardClass[]) {
  return attach('guards', guards, 'UseGuards')
}

/**
 * Adds interceptors to a module, a controller or a handler. The first one
 * given is the outermost.
 *
 * On a class, place it above `@Controller` / `@Module`.
 */
export function UseInterceptors(...interceptors: InterceptorClass[]) {
  return attach('interceptors', interceptors, 'UseInterceptors')
}
