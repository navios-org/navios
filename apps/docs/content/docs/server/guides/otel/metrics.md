---
sidebar_position: 3
---

# Metrics

Navios OTel supports OpenTelemetry metrics for monitoring your application's performance.

## Enabling Metrics

```typescript
app.usePlugin(defineOtelPlugin({
  serviceName: 'my-api',
  exporter: 'otlp',
  exporterOptions: {
    endpoint: 'http://localhost:4318/v1/traces',
  },
  autoInstrument: {
    http: true,
  },
  metrics: {
    enabled: true,
    requestDuration: true,  // Histogram of request durations
    errorCount: true,       // Counter of errors
  },
}))
```

## Installation for Metrics Export

```bash
yarn add @opentelemetry/exporter-metrics-otlp-http
```

## Default Metrics

When metrics are enabled, the following are automatically collected:

### Request Duration Histogram

- **Name**: `http.server.request.duration`
- **Type**: Histogram
- **Unit**: Milliseconds
- **Attributes**:
  - `http.method`: HTTP method (GET, POST, etc.)
  - `http.route`: Route pattern
  - `http.status_code`: Response status code

### Error Count

- **Name**: `http.server.error.count`
- **Type**: Counter
- **Attributes**:
  - `http.method`: HTTP method
  - `http.route`: Route pattern
  - `error.type`: Error type (e.g., `ValidationError`, `InternalError`)

## Custom Metrics

Use the `MeterToken` to create custom metrics:

```typescript
import { inject, Injectable } from '@navios/di'
import { MeterToken } from '@navios/otel'

@Injectable()
export class OrderService {
  private readonly meter = inject(MeterToken)

  // Counter
  private readonly ordersCreated = this.meter.createCounter('orders.created', {
    description: 'Number of orders created',
  })

  // Histogram
  private readonly orderProcessingTime = this.meter.createHistogram('orders.processing_time', {
    description: 'Time to process an order',
    unit: 'ms',
  })

  async createOrder(data: OrderData) {
    const start = Date.now()

    try {
      const order = await this.repository.create(data)

      this.ordersCreated.add(1, {
        'order.type': data.type,
        'customer.tier': data.customerTier,
      })

      return order
    } finally {
      this.orderProcessingTime.record(Date.now() - start, {
        'order.type': data.type,
      })
    }
  }
}
```

## Metrics Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `metrics.enabled` | `boolean` | `false` | Enable metrics collection |
| `metrics.requestDuration` | `boolean` | `true` | Track request duration histogram |
| `metrics.errorCount` | `boolean` | `true` | Track error count |

## Viewing Metrics

### Grafana

Query examples for Prometheus data source:

```promql
# Average request duration
rate(http_server_request_duration_sum[5m]) / rate(http_server_request_duration_count[5m])

# Request rate
rate(http_server_request_duration_count[5m])

# Error rate
rate(http_server_error_count[5m])
```

### Jaeger

Jaeger supports metrics through its OTLP endpoint when configured with Prometheus backend.
