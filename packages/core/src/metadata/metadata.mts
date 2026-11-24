import type { ClassType, Provider } from '@navios/di'

import type { RouteEndpointConfig } from '../routing/types.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What decorators and `handler()` options can attach to a handler.
 */
export interface HandlerExtras {
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
}

/**
 * A handler declared with `@Endpoint` on a method.
 */
export interface MethodHandlerMetadata extends HandlerExtras {
  name: string
  config: RouteEndpointConfig | null
}

export interface ControllerMetadata {
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
  /** Method-form handlers, and extras for field-form handlers, by member name. */
  members: Map<string, MethodHandlerMetadata>
}

export interface ModuleMetadata {
  prefix: string
  imports: ClassType[]
  controllers: ClassType[]
  guards: ClassType[]
  interceptors: ClassType[]
  providers: Provider[]
  attributes: Map<symbol, unknown>
}

const MembersKey = Symbol.for('navios.core.members')
const ClassAttributesKey = Symbol.for('navios.core.classAttributes')
const ClassGuardsKey = Symbol.for('navios.core.classGuards')
const ClassInterceptorsKey = Symbol.for('navios.core.classInterceptors')
export const ControllerMetadataKey = Symbol.for('navios.core.controller')
export const ModuleMetadataKey = Symbol.for('navios.core.module')

type DecoratorMetadata = Record<PropertyKey, unknown>

/**
 * Returns a value stored in decorator metadata under `key`, creating it for
 * this class if it only exists on a parent. Decorator metadata objects
 * inherit from the parent class's, so writing through an inherited value
 * would change the parent.
 */
function own<T>(metadata: DecoratorMetadata, key: symbol, create: (inherited?: T) => T): T {
  if (!Object.hasOwn(metadata, key)) {
    metadata[key] = create(metadata[key] as T | undefined)
  }
  return metadata[key] as T
}

function requireMetadata(context: { metadata?: DecoratorMetadata }): DecoratorMetadata {
  if (!context.metadata) {
    throw new Error(
      '[Navios] Decorator metadata is not available. Use standard decorators, or the ' +
        '@navios/core/legacy-compat entry point with experimentalDecorators.',
    )
  }
  return context.metadata
}

/** @internal */
export function memberMetadata(
  context: { metadata?: DecoratorMetadata },
  name: string,
): MethodHandlerMetadata {
  const members = own<Map<string, MethodHandlerMetadata>>(
    requireMetadata(context),
    MembersKey,
    (inherited) => {
      const copy = new Map<string, MethodHandlerMetadata>()
      if (inherited) {
        for (const [key, value] of inherited) {
          copy.set(key, {
            ...value,
            guards: [...value.guards],
            interceptors: [...value.interceptors],
            attributes: new Map(value.attributes),
          })
        }
      }
      return copy
    },
  )
  let member = members.get(name)
  if (!member) {
    member = { name, config: null, guards: [], interceptors: [], attributes: new Map() }
    members.set(name, member)
  }
  return member
}

/** @internal */
export function classAttributes(context: { metadata?: DecoratorMetadata }): Map<symbol, unknown> {
  return own(requireMetadata(context), ClassAttributesKey, (inherited) => new Map(inherited))
}

/** @internal */
export function classGuards(context: { metadata?: DecoratorMetadata }): ClassType[] {
  return own<ClassType[]>(requireMetadata(context), ClassGuardsKey, (inherited) => [
    ...(inherited ?? []),
  ])
}

/** @internal */
export function classInterceptors(context: { metadata?: DecoratorMetadata }): ClassType[] {
  return own<ClassType[]>(requireMetadata(context), ClassInterceptorsKey, (inherited) => [
    ...(inherited ?? []),
  ])
}

function unique(list: ClassType[]): ClassType[] {
  return Array.from(new Set(list))
}

/** Puts `first` in front of `list`, in place, skipping duplicates. */
function prepend(list: ClassType[], first: Iterable<ClassType> | undefined): ClassType[] {
  if (first) {
    const added = unique([...first]).filter((item) => !list.includes(item))
    list.unshift(...added)
  }
  return list
}

/** @internal */
export function defineControllerMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: { guards?: Iterable<ClassType>; interceptors?: Iterable<ClassType> },
): ControllerMetadata {
  const metadata = requireMetadata(context)
  const controller: ControllerMetadata = {
    // The live lists: @UseGuards / @UseInterceptors placed above this
    // decorator run after it and must still be seen.
    guards: prepend(classGuards(context), options.guards),
    interceptors: prepend(classInterceptors(context), options.interceptors),
    attributes: classAttributes(context),
    members: (metadata[MembersKey] as Map<string, MethodHandlerMetadata> | undefined) ?? new Map(),
  }
  Object.defineProperty(target, ControllerMetadataKey, {
    value: controller,
    configurable: true,
    enumerable: false,
  })
  return controller
}

/** @internal */
export function defineModuleMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: {
    prefix?: string
    imports?: Iterable<ClassType>
    controllers?: Iterable<ClassType>
    guards?: Iterable<ClassType>
    interceptors?: Iterable<ClassType>
    providers?: Iterable<Provider>
  },
): ModuleMetadata {
  const module: ModuleMetadata = {
    prefix: options.prefix ?? '',
    imports: unique([...(options.imports ?? [])]),
    controllers: unique([...(options.controllers ?? [])]),
    guards: prepend(classGuards(context), options.guards),
    interceptors: prepend(classInterceptors(context), options.interceptors),
    providers: [...(options.providers ?? [])],
    attributes: classAttributes(context),
  }
  Object.defineProperty(target, ModuleMetadataKey, {
    value: module,
    configurable: true,
    enumerable: false,
  })
  return module
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

export function hasControllerMetadata(target: ClassType): boolean {
  return Object.hasOwn(target, ControllerMetadataKey)
}

export function getModuleMetadata(target: ClassType): ModuleMetadata {
  const metadata = Object.hasOwn(target, ModuleMetadataKey)
    ? ((target as any)[ModuleMetadataKey] as ModuleMetadata)
    : undefined
  if (!metadata) {
    throw new Error(
      `[Navios] ${target.name} is not a module. Make sure it is decorated with @Module.`,
    )
  }
  return metadata
}

export function hasModuleMetadata(target: ClassType): boolean {
  return Object.hasOwn(target, ModuleMetadataKey)
}
