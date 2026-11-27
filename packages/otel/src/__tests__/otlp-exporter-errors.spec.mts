import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveOtelConfig } from '../otel-config.mjs'
import { createMetricReaders, createSpanExporter } from '../sdk/providers.mjs'

const config = resolveOtelConfig({
  serviceName: 'errors',
  exporter: 'otlp',
  exporterOptions: { endpoint: 'http://localhost:4318/v1/traces' },
  metrics: { enabled: true },
})

function recordingLogger() {
  return { debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('OTLP exporters that cannot be created', () => {
  afterEach(() => {
    vi.doUnmock('@opentelemetry/exporter-trace-otlp-http')
    vi.doUnmock('@opentelemetry/exporter-metrics-otlp-http')
    vi.resetModules()
  })

  it('reports a missing trace exporter package, with the import error as the cause', async () => {
    vi.doMock('@opentelemetry/exporter-trace-otlp-http', () => {
      throw new Error("Cannot find package '@opentelemetry/exporter-trace-otlp-http'")
    })
    const logger = recordingLogger()

    const error = await createSpanExporter(config, logger).catch((caught: Error) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(
      '@opentelemetry/exporter-trace-otlp-http is required',
    )
    expect((error as Error).cause).toBeInstanceOf(Error)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it('lets an error of the trace exporter itself through', async () => {
    const failure = new TypeError('Invalid URL')
    vi.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({
      OTLPTraceExporter: class {
        constructor() {
          throw failure
        }
      },
    }))
    const logger = recordingLogger()

    await expect(createSpanExporter(config, logger)).rejects.toBe(failure)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('exports no metrics, with a warning, when the metrics exporter package is missing', async () => {
    vi.doMock('@opentelemetry/exporter-metrics-otlp-http', () => {
      throw new Error("Cannot find package '@opentelemetry/exporter-metrics-otlp-http'")
    })
    const logger = recordingLogger()

    await expect(createMetricReaders(config, logger)).resolves.toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('lets an error of the metrics exporter itself through', async () => {
    const failure = new TypeError('Invalid URL')
    vi.doMock('@opentelemetry/exporter-metrics-otlp-http', () => ({
      OTLPMetricExporter: class {
        constructor() {
          throw failure
        }
      },
    }))
    const logger = recordingLogger()

    await expect(createMetricReaders(config, logger)).rejects.toBe(failure)
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
