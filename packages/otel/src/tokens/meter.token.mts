import { Token } from '@navios/di'

import type { Meter } from '@opentelemetry/api'

/**
 * Injection token for the OpenTelemetry Meter instance.
 *
 * Use this token to inject the meter and create custom metrics:
 *
 * @example
 * ```typescript
 * import { Inject, Injectable } from '@navios/di'
 * import { MeterToken } from '@navios/otel'
 *
 * @Injectable()
 * class MyService {
 *   @Inject(MeterToken) private accessor meter!: Meter
 *
 *   async doWork() {
 *     this.meter.createCounter('my_counter').add(1, { operation: 'doWork' })
 *   }
 * }
 * ```
 */
export const MeterToken = Token.create<Meter>('OtelMeter')
