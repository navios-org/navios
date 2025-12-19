---
sidebar_position: 7
---

# Circular Dependencies

Circular dependencies occur when services depend on each other in a cycle. Navios DI automatically detects circular dependencies and provides helpful error messages. This guide shows you how to identify and resolve them.

## What is a Circular Dependency?

A circular dependency happens when two or more services depend on each other directly or indirectly:

```typescript
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB) // A depends on B
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA) // B depends on A - circular!
}
```

## Automatic Detection

Navios DI automatically detects circular dependencies and throws a clear error:

```typescript
// This will throw: "Circular dependency detected: ServiceA -> ServiceB -> ServiceA"
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB)
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA)
}
```

## Resolving Circular Dependencies

The solution is to use `asyncInject()` on at least one side of the circular dependency:

### Solution 1: Use asyncInject on One Side

```typescript
@Injectable()
class ServiceA {
  // Use asyncInject to break circular dependency
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  // This side can use inject()
  private serviceA = inject(ServiceA)

  getValue() {
    return 'value from B'
  }
}
```

### Solution 2: Use asyncInject on Both Sides

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  private serviceA = asyncInject(ServiceA)

  async getValue() {
    const a = await this.serviceA
    return 'value from B'
  }
}
```

## Complex Circular Dependencies

Circular dependencies can involve more than two services:

```typescript
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB) // A -> B
}

@Injectable()
class ServiceB {
  private serviceC = inject(ServiceC) // B -> C
}

@Injectable()
class ServiceC {
  private serviceA = inject(ServiceA) // C -> A (circular: A -> B -> C -> A)
}
```

### Resolution

Break the cycle at any point using `asyncInject()`:

```typescript
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB)
}

@Injectable()
class ServiceB {
  private serviceC = inject(ServiceC)
}

@Injectable()
class ServiceC {
  // Break the cycle here
  private serviceA = asyncInject(ServiceA)

  async doSomething() {
    const a = await this.serviceA
    return a.getValue()
  }
}
```

## Real-World Example

### User Service and Order Service

```typescript
@Injectable()
class UserService {
  private orderService = asyncInject(OrderService) // Break cycle here

  async getUserOrders(userId: string) {
    const orders = await this.orderService
    return orders.getOrdersByUserId(userId)
  }

  getUser(userId: string) {
    return { id: userId, name: 'John' }
  }
}

@Injectable()
class OrderService {
  private userService = inject(UserService) // Can use inject on this side

  getOrdersByUserId(userId: string) {
    const user = this.userService.getUser(userId)
    return [{ id: '1', userId, product: 'Widget' }]
  }
}
```

## Best Practices

### 1. Break Cycles with asyncInject

```typescript
// ✅ Good: Break cycle with asyncInject
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

// ❌ Avoid: Both sides using inject
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB) // Circular dependency error!
}
```

### 2. Minimize Circular Dependencies

While circular dependencies can be resolved, they often indicate a design issue. Consider:

- **Extracting shared logic**: Move common functionality to a third service
- **Using events**: Decouple services using an event system
- **Refactoring dependencies**: Restructure to eliminate the cycle

### 3. Document Circular Dependencies

If you must have circular dependencies, document them:

```typescript
/**
 * ServiceA depends on ServiceB, and ServiceB depends on ServiceA.
 * We use asyncInject on ServiceA's side to break the cycle.
 */
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)
}
```

## Common Patterns

### Mediator Pattern

Instead of services depending on each other, use a mediator:

```typescript
@Injectable()
class MediatorService {
  private userService = inject(UserService)
  private orderService = inject(OrderService)

  async getUserWithOrders(userId: string) {
    const user = this.userService.getUser(userId)
    const orders = this.orderService.getOrdersByUserId(userId)
    return { user, orders }
  }
}

@Injectable()
class UserService {
  // No dependency on OrderService
  getUser(userId: string) {
    return { id: userId, name: 'John' }
  }
}

@Injectable()
class OrderService {
  // No dependency on UserService
  getOrdersByUserId(userId: string) {
    return [{ id: '1', userId, product: 'Widget' }]
  }
}
```

### Event-Based Communication

Use events to decouple services:

```typescript
@Injectable()
class EventBus {
  private listeners = new Map<string, Function[]>()

  on(event: string, listener: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(listener)
  }

  emit(event: string, data: any) {
    const listeners = this.listeners.get(event) || []
    listeners.forEach((listener) => listener(data))
  }
}

@Injectable()
class UserService {
  private eventBus = inject(EventBus)

  createUser(userData: any) {
    const user = { id: '1', ...userData }
    this.eventBus.emit('user.created', user)
    return user
  }
}

@Injectable()
class OrderService {
  private eventBus = inject(EventBus)
  private unsubscribeFn: null | (() => void) = null

  onServiceInit() {
    this.unsubscribeFn = this.eventBus.on('user.created', (user) => {
      console.log('User created:', user)
    })
  }

  onServiceDestroy() {
    this.unsubscribeFn()
  }
}
```

## Troubleshooting

### Error: "Circular dependency detected"

**Problem**: Services depend on each other in a cycle.

**Solution**: Use `asyncInject()` on at least one side of the cycle.

### Error: "Maximum call stack size exceeded"

**Problem**: Circular dependency not properly resolved.

**Solution**: Ensure you're using `asyncInject()` and awaiting it properly.

### Performance Issues

**Problem**: Circular dependencies can cause performance issues if not handled correctly.

**Solution**:

- Minimize circular dependencies
- Use mediator pattern or events
- Consider refactoring to eliminate cycles

## Next Steps

- Learn about [services](/docs/di/di/guides/services) for service creation
- Explore [injection methods](/docs/di/di/guides/services#injection-methods) for dependency injection
- Understand [best practices](/docs/di/di/best-practices) for service design
