import { resourceFromAttributes } from '@opentelemetry/resources'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { describe, expect, it } from 'vitest'

// Note: the Resource and MeterProvider come from SDK 3.x, while NodeTracerProvider
// runs on sdk-trace-node 2.12 (no 3.x released yet), so this pins the actual mixed stack.
describe('OpenTelemetry SDK 3 API', () => {
  it('builds a resource with resourceFromAttributes and reads attributes back', () => {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service',
      [ATTR_SERVICE_VERSION]: '1.2.3',
    })

    expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('test-service')
    expect(resource.attributes[ATTR_SERVICE_VERSION]).toBe('1.2.3')
  })

  it('passes the resource and span processors to NodeTracerProvider', async () => {
    const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'test-service' })
    const exporter = new InMemorySpanExporter()
    const provider = new NodeTracerProvider({
      resource,
      spanProcessors: [new SimpleSpanProcessor(exporter)],
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
