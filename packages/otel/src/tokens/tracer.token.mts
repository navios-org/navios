import { InjectionToken } from '@navios/di'

import type { Tracer } from '@opentelemetry/api'

/**
 * Injection token for the OpenTelemetry Tracer instance.
 *
 * Use this token to inject the tracer and create custom spans:
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/di'
 * import { TracerToken } from '@navios/otel'
 *
 * @Injectable()
 * class MyService {
 *   private readonly tracer = inject(TracerToken)
 *
 *   async doWork() {
 *     const span = this.tracer.startSpan('my-operation')
 *     try {
 *       // ... do work
 *     } finally {
 *       span.end()
 *     }
 *   }
 * }
 * ```
 */
export const TracerToken = InjectionToken.create<Tracer>('OtelTracer')
