---
sidebar_position: 1
---

# @Traced Decorator

The `@Traced` decorator provides a declarative way to add tracing to your classes and methods.

## Class-Level Tracing

Apply `@Traced` to a class to trace all its public methods:

```typescript
import { Injectable } from '@navios/di'
import { Traced } from '@navios/otel'

@Injectable()
@Traced({ name: 'user-service' })
export class UserService {
  async getUser(id: string) {
    // Creates span: "user-service.getUser"
    return { id, name: 'John' }
  }

  async updateUser(id: string, data: UserData) {
    // Creates span: "user-service.updateUser"
    return { id, ...data }
  }
}
```

## Method-Level Tracing

Apply `@Traced` to specific methods when you don't want to trace the entire class:

```typescript
import { Injectable } from '@navios/di'
import { Traced } from '@navios/otel'

@Injectable()
export class OrderService {
  // Not traced
  async getOrder(id: string) {
    return this.repository.findById(id)
  }

  // Traced
  @Traced({ name: 'process-order' })
  async processOrder(orderId: string) {
    // Creates span: "process-order"
  }

  // Traced with custom attributes
  @Traced({
    name: 'heavy-calculation',
    attributes: { 'order.type': 'bulk' }
  })
  async calculateBulkDiscount(orders: Order[]) {
    // Creates span: "heavy-calculation" with order.type=bulk
  }
}
```

## Combining Class and Method Decorators

You can override class-level settings on specific methods:

```typescript
@Injectable()
@Traced({ name: 'payment-service' })
export class PaymentService {
  // Uses class name: "payment-service.createPayment"
  async createPayment(data: PaymentData) {
    return { id: '123', ...data }
  }

  // Overrides with custom name: "validate-payment-details"
  @Traced({ name: 'validate-payment-details' })
  async validatePayment(paymentId: string) {
    return { valid: true }
  }
}
```

## Controller Tracing

When `autoInstrument.handlers` is disabled, use `@Traced` on controllers:

```typescript
import { Controller, Endpoint } from '@navios/core'
import { Traced } from '@navios/otel'

@Controller()
@Traced({ name: 'user-controller' })
export class UserController {
  @Endpoint(getUserEndpoint)
  async getUser(request: EndpointParams<typeof getUserEndpoint>) {
    // Traced
  }
}
```

## Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | Class/method name | Custom span name |
| `attributes` | `Record<string, AttributeValue>` | - | Additional span attributes |

## Span Naming Convention

- Class-level: `{name}.{methodName}` (e.g., `user-service.getUser`)
- Method-level: `{name}` (e.g., `process-order`)
- Default (no name): `{ClassName}.{methodName}` (e.g., `UserService.getUser`)
