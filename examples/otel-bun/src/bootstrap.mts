import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'
import { defineOtelPlugin } from '@navios/otel-bun'

import { getOtelConfig, logOtelConfig } from './config/otel.config.mjs'
import { AppModule } from './modules/app/app.module.mjs'

async function bootstrap() {
  // Get OTEL configuration from environment variables
  const otelConfig = getOtelConfig()

  // Log configuration for debugging
  logOtelConfig(otelConfig)

  // Create the application
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(),
  })

  // Enable CORS
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  // Register OpenTelemetry plugins (returns array of staged plugins)
  for (const pluginDef of defineOtelPlugin(otelConfig)) {
    app.usePlugin(pluginDef)
  }

  // Initialize the application
  await app.init()

  // Start listening
  const port = parseInt(process.env.PORT || '3000', 10)
  const host = process.env.HOST || 'localhost'

  await app.listen({ port, host })

  console.log(`\nServer running at http://${host}:${port}`)
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
