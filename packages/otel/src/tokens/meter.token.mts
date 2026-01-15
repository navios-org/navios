import type { Meter } from '@opentelemetry/api'

import { InjectionToken } from '@navios/di'

/**
 * Injection token for the OpenTelemetry Meter instance.
 *
 * Use this token to inject the meter and create custom metrics:
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/di'
 * import { MeterToken } from '@navios/otel'
 *
 * @Injectable()
 * class MyService {
 *   private readonly meter = inject(MeterToken)
 *   private readonly counter = this.meter.createCounter('my_counter')
 *
 *   async doWork() {
 *     this.counter.add(1, { operation: 'doWork' })
 *   }
 * }
 * ```
 */
export const MeterToken = InjectionToken.create<Meter>('OtelMeter')
