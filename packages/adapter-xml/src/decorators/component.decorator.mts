import type { Registry } from '@navios/core'
import type { z, ZodObject, ZodRawShape } from 'zod/v4'

import {
  globalRegistry,
  InjectableScope,
  InjectableTokenMeta,
  InjectableType,
  InjectionToken,
} from '@navios/core'

import type { ComponentClass, XmlComponent } from '../types/component.mjs'

export const ComponentMeta = Symbol.for('xml.component.meta')

// #1 Component without props (no schema)
export function Component(): <T extends ComponentClass>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #2 Component with props schema
export function Component<Schema extends ZodObject<ZodRawShape>>(options: {
  schema: Schema
  registry?: Registry
}): <T extends new (props: z.output<Schema>, ...args: any[]) => XmlComponent>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #3 Component with custom registry only
export function Component(options: {
  registry: Registry
}): <T extends ComponentClass>(target: T, context?: ClassDecoratorContext) => T

export function Component(
  options: {
    schema?: ZodObject<ZodRawShape>
    registry?: Registry
  } = {},
) {
  const { schema, registry = globalRegistry } = options

  return <T extends ComponentClass>(
    target: T,
    context?: ClassDecoratorContext,
  ): T => {
    if (
      (context && context.kind !== 'class') ||
      (target instanceof Function && !context)
    ) {
      throw new Error(
        '[@navios/adapter-xml] @Component decorator can only be used on classes.',
      )
    }

    // Verify the class has a render method
    if (typeof target.prototype.render !== 'function') {
      throw new Error(
        `[@navios/adapter-xml] @Component class "${target.name}" must implement render() method.`,
      )
    }

    // Create token with schema if provided
    const injectableToken = schema
      ? InjectionToken.create(target, schema)
      : InjectionToken.create(target)

    // Register with Request scope - each render gets fresh instances
    registry.set(
      injectableToken,
      InjectableScope.Request,
      target,
      InjectableType.Class,
    )

    // Store token metadata on the class (same pattern as @Injectable)
    // @ts-expect-error - Adding metadata to class
    target[InjectableTokenMeta] = injectableToken

    // Mark as component for JSX runtime detection
    // @ts-expect-error - Adding metadata to class
    target[ComponentMeta] = true

    return target
  }
}

/**
 * Type guard to check if a class is a component
 */
export function isComponentClass(value: unknown): value is ComponentClass {
  return (
    typeof value === 'function' &&
    // @ts-expect-error - Checking metadata
    value[ComponentMeta] === true
  )
}
