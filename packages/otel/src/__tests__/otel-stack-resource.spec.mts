import { resourceFromAttributes } from '@opentelemetry/resources'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { describe, expect, it } from 'vitest'

// Pins the SDK 3 shapes the package builds on. All SDK packages must come from
// the same major: each major accepts only its own range of `@opentelemetry/api`.
describe('OpenTelemetry SDK 3 API', () => {
  it('builds a resource with resourceFromAttributes and reads attributes back', () => {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service',
      [ATTR_SERVICE_VERSION]: '1.2.3',
    })

    expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('test-service')
    expect(resource.attributes[ATTR_SERVICE_VERSION]).toBe('1.2.3')
  })

  it('passes the resource and span processors to TracerProvider', async () => {
    const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'test-service' })
    const exporter = new InMemorySpanExporter()
    const provider = new TracerProvider({
      resource,
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    })

    const span = provider.getTracer('test').startSpan('op')
    span.end()

    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    expect(spans[0].name).toBe('op')
    expect(spans[0].resource.attributes[ATTR_SERVICE_NAME]).toBe('test-service')

    await provider.shutdown()
  })

  it('accepts a resource in MeterProvider', async () => {
    const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'test-service' })
    const provider = new MeterProvider({ resource, readers: [] })

    expect(provider.getMeter('test')).toBeDefined()

    await provider.shutdown()
  })
})
