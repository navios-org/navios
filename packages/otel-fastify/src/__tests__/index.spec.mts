import { otelPlugin as corePlugin } from '@navios/otel'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { OtelPluginOptions } from '@navios/otel'

import { defineOtelPlugin, otelPlugin } from '../index.mjs'

import type { FastifyOtelPluginOptions } from '../index.mjs'

describe('@navios/otel-fastify (deprecated re-export)', () => {
  it('re-exports the plugin of @navios/otel under both names', () => {
    expect(otelPlugin).toBe(corePlugin)
    expect(defineOtelPlugin).toBe(corePlugin)
  })

  it('creates an instance of the adapter-neutral plugin that carries the options', () => {
    const options: FastifyOtelPluginOptions = {
      serviceName: 'api',
      exporter: 'none',
      ignoreRoutes: ['/health', '/docs/*'],
    }

    const instance = defineOtelPlugin(options)

    expect(instance.definition.name).toBe('otel')
    expect(instance.options).toBe(options)
  })

  it('keeps the options type as an alias', () => {
    expectTypeOf<FastifyOtelPluginOptions>().toEqualTypeOf<OtelPluginOptions>()
  })
})
