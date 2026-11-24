---
sidebar_position: 4
---

# Custom Spans

While auto-instrumentation handles most tracing needs, you can create custom spans for fine-grained control.

## Using the Tracer

Inject the `TracerToken` to create custom spans:

```typescript
import { inject, Injectable } from '@navios/di'
import { TracerToken } from '@navios/otel'

@Injectable()
export class OrderService {
  private readonly tracer = inject(TracerToken)

  async processOrder(orderId: string) {
    // Create a custom span
    const span = this.tracer.startSpan('process-order')

    try {
      // Add attributes
      span.setAttribute('order.id', orderId)

      // Do work
      const order = await this.fetchOrder(orderId)
      span.setAttribute('order.total', order.total)

      await this.validateOrder(order)
      await this.chargePayment(order)
      await this.sendConfirmation(order)

      return order
    } catch (error) {
      // Record the error
      span.recordException(error as Error)
      throw error
    } finally {
      // Always end the span
      span.end()
    }
  }
}
```

## Using SpanFactoryService

The `SpanFactoryService` provides helper methods with consistent attributes:

```typescript
import { inject, Injectable } from '@navios/di'
import { SpanFactoryService } from '@navios/otel'

@Injectable()
export class PaymentService {
  private readonly spanFactory = inject(SpanFactoryService)

  async processPayment(paymentId: string) {
    // Create a child span (automatically links to parent)
    const span = this.spanFactory.createChildSpan({
      name: 'process-payment',
      attributes: {
        'payment.id': paymentId,
      },
    })

    try {
      const result = await this.chargeCard(paymentId)
      return result
    } catch (error) {
      this.spanFactory.recordError(span, error)
      throw error
    } finally {
      span.end()
    }
  }
}
```

## Nested Spans

Spans automatically create parent-child relationships:

```typescript
@Injectable()
export class OrderService {
  private readonly tracer = inject(TracerToken)
  private readonly paymentService = inject(PaymentService)

  async createOrder(data: OrderData) {
    const span = this.tracer.startSpan('create-order')

    try {
      // This span is a child of 'create-order'
      const payment = await this.paymentService.processPayment(data.paymentId)

      // This span is also a child of 'create-order'
      await this.notifyCustomer(data.customerId)

      return { orderId: '123', payment }
    } finally {
      span.end()
    }
  }
}
```

Result trace:
```
create-order (100ms)
├── process-payment (45ms)
│   └── charge-card (30ms)
└── notify-customer (20ms)
```

## Getting the Current Span

Access the currently active span:

```typescript
import { getCurrentSpan } from '@navios/otel'

function logWithTraceContext(message: string) {
  const span = getCurrentSpan()
  if (span) {
    const context = span.spanContext()
    console.log(`[trace_id=${context.traceId}] ${message}`)
  }
}
```

## Using TraceContextService

For context propagation across async boundaries:

```typescript
import { inject, Injectable } from '@navios/di'
import { TraceContextService, TracerToken } from '@navios/otel'

@Injectable()
export class HttpClient {
  private readonly tracer = inject(TracerToken)
  private readonly traceContext = inject(TraceContextService)

  async request(url: string, options: RequestInit = {}) {
    const span = this.tracer.startSpan(`HTTP ${options.method || 'GET'} ${url}`)

    try {
      // Inject trace context into outgoing headers
      const headers = { ...options.headers } as Record<string, string>
      this.traceContext.injectIntoHeaders(headers)

      const response = await fetch(url, { ...options, headers })

      span.setAttribute('http.status_code', response.status)
      return response
    } catch (error) {
      span.recordException(error as Error)
      throw error
    } finally {
      span.end()
    }
  }
}
```

## Best Practices

1. **Always end spans**: Use `try/finally` to ensure spans are ended
2. **Record exceptions**: Call `span.recordException(error)` before rethrowing
3. **Use meaningful names**: Span names should describe the operation
4. **Add relevant attributes**: Include IDs, types, and other context
5. **Keep spans focused**: One span per logical operation
