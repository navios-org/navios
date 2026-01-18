import { Injectable, inject } from '@navios/di'
import { SpanStatusCode } from '@opentelemetry/api'

import type { ClassTypeWithInstance } from '@navios/di'
import type { AttributeValue } from '@opentelemetry/api'

import { extractTracedMetadata, hasTracedMetadata } from '../decorators/traced.decorator.mjs'

import type { ClassTracedMetadata, MethodTracedMetadata } from '../decorators/traced.decorator.mjs'

import { SpanFactoryService } from './span-factory.service.mjs'

/**
 * Factory service that creates tracing proxies for services decorated with @Traced.
 *
 * Performance optimizations:
 * 1. Pre-wraps explicitly traced methods when the proxy is created
 * 2. Lazily wraps class-level traced methods on first access and caches them
 * 3. Pre-computes span name and attributes (done once, not per call)
 *
 * @example
 * ```typescript
 * const proxyFactory = await container.get(TracedProxyFactory)
 * const wrappedService = proxyFactory.wrap(originalService, ServiceClass)
 * ```
 */
@Injectable()
export class TracedProxyFactory {
  private readonly spanFactory = inject(SpanFactoryService)

  /**
   * Wraps an instance with a tracing proxy.
   * Pre-wraps known traced methods for performance.
   *
   * @param instance - The service instance to wrap
   * @param classType - The class type for metadata extraction
   * @returns The wrapped instance (or original if no traced metadata)
   */
  wrap<T extends object>(instance: T, classType: ClassTypeWithInstance<T>): T {
    if (!hasTracedMetadata(classType)) {
      return instance
    }

    const metadata = extractTracedMetadata(classType)
    return this.createTracingProxy(instance, classType, metadata)
  }

  private createTracingProxy<T extends object>(
    instance: T,
    classType: ClassTypeWithInstance<T>,
    metadata: ClassTracedMetadata,
  ): T {
    const baseName = metadata.name ?? classType.name
    const baseAttributes = metadata.attributes ?? {}

    // Cache for wrapped methods - persists for the lifetime of the proxy
    const wrappedMethodCache = new Map<string | symbol, Function>()
    let getter: (target: any, prop: string | symbol, receiver: any) => any
    const proxy = new Proxy(instance, {
      get: (target, prop, receiver) => {
        return getter(target, prop, receiver)
      },
    })

    // Pre-wrap all explicitly traced methods from metadata
    for (const [methodName, methodMetadata] of metadata.methods) {
      const originalMethod = (instance as any)[methodName]
      if (typeof originalMethod === 'function') {
        const wrapped = this.createWrappedMethod(
          originalMethod.bind(proxy),
          baseName,
          methodName,
          methodMetadata,
          baseAttributes,
        )
        wrappedMethodCache.set(methodName, wrapped)
      }
    }

    getter = (target, prop, receiver) => {
      // Check cache first (for pre-wrapped and dynamically wrapped methods)
      const cached = wrappedMethodCache.get(prop)
      if (cached) {
        return cached
      }

      const value = Reflect.get(target, prop, receiver)

      // Non-function or symbol props - return as-is
      if (typeof value !== 'function' || typeof prop === 'symbol') {
        return value
      }

      const methodName = prop as string

      // If class-level tracing is enabled and method wasn't explicitly decorated,
      // wrap it and cache for future calls
      if (metadata.enabled && !metadata.methods.has(methodName)) {
        const wrapped = this.createWrappedMethod(
          value.bind(proxy),
          baseName,
          methodName,
          undefined, // No method-specific metadata
          baseAttributes,
        )
        wrappedMethodCache.set(methodName, wrapped)
        return wrapped
      }

      // Method not traced - return original
      return value
    }

    return proxy
  }

  /**
   * Creates a wrapped method function that creates spans.
   * This is called once per method and cached.
   */
  private createWrappedMethod(
    originalMethod: Function,
    baseName: string,
    methodName: string,
    methodMetadata: MethodTracedMetadata | undefined,
    classAttributes: Record<string, AttributeValue>,
  ): Function {
    const spanFactory = this.spanFactory

    // Pre-compute span name and attributes (done once, not per call)
    const spanName = methodMetadata?.name ?? `${baseName}.${methodName}`
    const mergedAttributes: Record<string, AttributeValue> = {
      ...classAttributes,
      ...methodMetadata?.attributes,
      'code.function': methodName,
      'code.namespace': baseName,
    }

    return function (this: any, ...args: any[]) {
      // Create child span using SpanFactoryService
      const span = spanFactory.createChildSpan({
        name: spanName,
        attributes: mergedAttributes,
      })

      try {
        const result = originalMethod.apply(this, args)

        // Handle both sync and async methods
        if (result instanceof Promise) {
          return result
            .then((value) => {
              span.setStatus({ code: SpanStatusCode.OK })
              span.end()
              return value
            })
            .catch((error) => {
              spanFactory.recordError(span, error)
              span.end()
              throw error
            })
        }

        span.setStatus({ code: SpanStatusCode.OK })
        span.end()
        return result
      } catch (error) {
        spanFactory.recordError(span, error)
        span.end()
        throw error
      }
    }
  }
}
