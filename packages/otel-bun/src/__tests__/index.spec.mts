import { describe, expect, it } from 'bun:test'

import { otelPlugin as corePlugin } from '@navios/otel'

import { defineOtelPlugin, otelPlugin } from '../index.mjs'

import type { BunOtelPluginOptions } from '../index.mjs'

describe('@navios/otel-bun (deprecated re-export)', () => {
  it('re-exports the plugin of @navios/otel', () => {
    expect(otelPlugin).toBe(corePlugin)
  })

  it('defineOtelPlugin returns the adapter-neutral plugin in a one-element array', () => {
    const options: BunOtelPluginOptions = {
      serviceName: 'api',
      exporter: 'none',
      ignoreRoutes: ['/health', '/docs/*'],
    }

    const plugins = defineOtelPlugin(options)

    expect(plugins).toHaveLength(1)
    expect(plugins[0].definition).toBe(corePlugin(options).definition)
    expect(plugins[0].definition.name).toBe('otel')
    expect(plugins[0].options).toBe(options)
  })
})
