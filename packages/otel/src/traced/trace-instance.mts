import { context as otelContext, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

import type { ClassType } from '@navios/di'
import type { AttributeValue, Tracer } from '@opentelemetry/api'

import { parentContext } from '../tracing/context.mjs'
import { recordSpanError } from '../tracing/record-span-error.mjs'

import { extractTracedMetadata, hasTracedMetadata } from './traced-metadata.mjs'

import type { MethodTracedMetadata } from './traced-metadata.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

const instrumented = Symbol('navios:traced:instrumented')

/** Methods that are part of a service's lifecycle, not of its work. */
const SKIPPED = new Set(['constructor', 'onServiceInit', 'onServiceDestroy'])

const methodNames = new WeakMap<object, string[]>()

/**
 * Names of the methods an instance of a class has, own class and ancestors.
 * Computed once per prototype.
 */
function prototypeMethods(prototype: object | null): string[] {
  if (prototype === null || prototype === Object.prototype) {
    return []
  }
  const cached = methodNames.get(prototype)
  if (cached) {
    return cached
  }
  const names = new Set(prototypeMethods(Object.getPrototypeOf(prototype)))
  for (const name of Object.getOwnPropertyNames(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)!
    if (typeof descriptor.value === 'function' && !SKIPPED.has(name)) {
      names.add(name)
    }
  }
  const list = [...names]
  methodNames.set(prototype, list)
  return list
}

function traceMethod(
  original: (...args: any[]) => unknown,
  tracer: Tracer,
  baseName: string,
  methodName: string,
  methodMetadata: MethodTracedMetadata | undefined,
  classAttributes: Record<string, AttributeValue>,
) {
  // Computed once per method, not per call.
  const spanName = methodMetadata?.name ?? `${baseName}.${methodName}`
  const attributes: Record<string, AttributeValue> = {
    ...classAttributes,
    ...methodMetadata?.attributes,
    'code.function': methodName,
    'code.namespace': baseName,
  }

  return function traced(this: unknown, ...args: any[]): unknown {
    const parent = parentContext()
    const span = tracer.startSpan(spanName, { kind: SpanKind.INTERNAL, attributes }, parent)
    try {
      // The method runs with its span active, so spans started inside it,
      // including those of other traced services, become its children.
      const result = otelContext.with(trace.setSpan(parent, span), () => original.apply(this, args))
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            span.setStatus({ code: SpanStatusCode.OK })
            span.end()
            return value
          },
          (error) => {
            recordSpanError(span, error)
            span.end()
            throw error
          },
        )
      }
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
      return result
    } catch (error) {
      recordSpanError(span, error)
      span.end()
      throw error
    }
  }
}

/**
 * Makes the methods of an instance start a span around each call, according
 * to the `@Traced` / `@Traceable` metadata of `classType`.
 *
 * The instance is changed in place and returned: each traced method is
 * shadowed by an own, non-enumerable property. The object keeps its identity
 * and its class, `#private` members keep working, and a traced method that
 * calls another traced method on `this` produces a nested span.
 *
 * An instance of a class without traced metadata is returned untouched.
 */
export function traceInstance<T extends object>(
  instance: T,
  classType: ClassType,
  tracer: Tracer,
): T {
  if (!hasTracedMetadata(classType) || (instance as any)[instrumented] === true) {
    return instance
  }
  const metadata = extractTracedMetadata(classType)
  const baseName = metadata.name ?? classType.name
  const baseAttributes = metadata.attributes ?? {}

  const names = new Set<string>(metadata.methods.keys())
  if (metadata.enabled) {
    for (const name of prototypeMethods(Object.getPrototypeOf(instance))) {
      names.add(name)
    }
    // Methods written as function-valued fields.
    for (const name of Object.keys(instance)) {
      if (!SKIPPED.has(name)) {
        names.add(name)
      }
    }
  }

  for (const name of names) {
    const original = (instance as any)[name]
    if (typeof original !== 'function') {
      continue
    }
    Object.defineProperty(instance, name, {
      value: traceMethod(
        original,
        tracer,
        baseName,
        name,
        metadata.methods.get(name),
        baseAttributes,
      ),
      writable: true,
      configurable: true,
      enumerable: false,
    })
  }
  Object.defineProperty(instance, instrumented, { value: true })
  return instance
}
