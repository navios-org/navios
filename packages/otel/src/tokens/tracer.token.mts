import { Token } from '@navios/di'

import type { Tracer } from '@opentelemetry/api'

/**
 * Injection token for the OpenTelemetry Tracer instance.
 *
 * Use this token to inject the tracer and create custom spans:
 *
 * @example
 * ```typescript
 * import { Inject, Injectable } from '@navios/di'
 * import { TracerToken } from '@navios/otel'
 *
 * @Injectable()
 * class MyService {
 *   @Inject(TracerToken) private accessor tracer!: Tracer
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
export const TracerToken = Token.create<Tracer>('OtelTracer')
