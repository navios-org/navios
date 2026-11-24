import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'
import { otelPlugin } from '@navios/otel'

import type { BunEnvironment } from '@navios/adapter-bun'

import { getOtelConfig, logOtelConfig } from './config/otel.config.mjs'
// Importing the module tree runs the @Traced decorators; the plugin reads
// the classes they marked once, during init().
import { AppModule } from './modules/app/app.module.mjs'

declare module '@navios/core' {
  interface Register {
    environment: BunEnvironment
  }
}

async function bootstrap() {
  // Get OTEL configuration from environment variables
  const otelConfig = getOtelConfig()

  // Log configuration for debugging
  logOtelConfig(otelConfig)

  // One plugin, the same on every adapter: it starts the SDK, traces HTTP
  // requests and @Traced services, and flushes on app.close().
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment({
      cors: {
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      },
    }),
    plugins: [otelPlugin(otelConfig)],
  })

  // Start listening
  const port = parseInt(process.env.PORT || '3000', 10)
  const host = process.env.HOST || 'localhost'

  const url = await app.listen({ port, hostname: host })

  // Flush buffered spans before the process exits.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().finally(() => process.exit(0))
    })
  }

  console.log(`\nServer running at ${url}`)
  console.log('\nAvailable endpoints:')
  console.log('  GET  /health          - Health check (ignored in traces)')
  console.log('  GET  /metrics         - Simple metrics endpoint')
  console.log('  GET  /items           - List all items')
  console.log('  GET  /items/:id       - Get item by ID')
  console.log('  POST /items           - Create new item')
  console.log('  PUT  /items/:id       - Update item')
  console.log('  DELETE /items/:id     - Delete item')
  console.log('  GET  /slow?delay=1000 - Slow operation (for testing traces)')
  console.log('  GET  /error?type=...  - Error endpoint (validation|not-found|internal)')
  console.log('  GET  /chain?depth=3   - Chain operations (nested spans)')
  console.log('\nUI Links:')
  console.log('  Jaeger UI:     http://localhost:16686')
  console.log('  Prometheus:    http://localhost:9090')
  console.log('  Grafana:       http://localhost:3001 (admin/admin)')
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err)
  process.exit(1)
})
