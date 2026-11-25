import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace'

import type { ResolvedOtelConfig } from '../config/otel-config.mjs'

/**
 * The sampler for the configured `sampling.ratio`.
 */
export function createSampler(config: ResolvedOtelConfig) {
  const ratio = config.sampling.ratio
  if (ratio >= 1.0) {
    return new AlwaysOnSampler()
  }
  if (ratio <= 0.0) {
    return new AlwaysOffSampler()
  }
  return new TraceIdRatioBasedSampler(ratio)
}
