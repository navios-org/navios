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
  @Inject(ServiceB) // A depends on B
  private accessor serviceB!: ServiceB
}

@Injectable()
class ServiceB {
  @Inject(ServiceA) // B depends on A - circular!
  private accessor serviceA!: ServiceA
}
```

## Automatic Detection

Navios DI automatically detects circular dependencies and throws a clear error:

```typescript
// This will throw: "Circular dependency detected: ServiceA -> ServiceB -> ServiceA"
@Injectable()
class ServiceA {
  @Inject(ServiceB)
  private accessor serviceB!: ServiceB
}

@Injectable()
class ServiceB {
  @Inject(ServiceA)
  private accessor serviceA!: ServiceA
}
```

## Resolving Circular Dependencies

The solution is to use `@InjectLazy` on at least one side of the circular dependency. The lazy field is a `Promise<T>` that resolves on first `await`.

### Solution 1: Use @InjectLazy on One Side

```typescript
@Injectable()
class ServiceA {
  // Use @InjectLazy to break the circular dependency
  @InjectLazy(ServiceB)
  private accessor serviceB!: Promise<ServiceB>

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  // This side can use eager @Inject
  @Inject(ServiceA)
  private accessor serviceA!: ServiceA

  getValue() {
    return 'value from B'
  }
}
```

### Solution 2: Use @InjectLazy on Both Sides

```typescript
@Injectable()
class ServiceA {
  @InjectLazy(ServiceB)
  private accessor serviceB!: Promise<ServiceB>

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  @InjectLazy(ServiceA)
  private accessor serviceA!: Promise<ServiceA>

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
  @Inject(ServiceB) // A -> B
  private accessor serviceB!: ServiceB
}

@Injectable()
class ServiceB {
  @Inject(ServiceC) // B -> C
  private accessor serviceC!: ServiceC
}

@Injectable()
class ServiceC {
  @Inject(ServiceA) // C -> A (circular: A -> B -> C -> A)
  private accessor serviceA!: ServiceA
}
```

### Resolution

Break the cycle at any point using `@InjectLazy`:

```typescript
@Injectable()
class ServiceA {
  @Inject(ServiceB)
  private accessor serviceB!: ServiceB
}

@Injectable()
class ServiceB {
  @Inject(ServiceC)
  private accessor serviceC!: ServiceC
}

@Injectable()
class ServiceC {
  // Break the cycle here
  @InjectLazy(ServiceA)
  private accessor serviceA!: Promise<ServiceA>

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
  @InjectLazy(OrderService) // Break cycle here
  private accessor orderService!: Promise<OrderService>

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
  @Inject(UserService) // Can use eager @Inject on this side
  private accessor userService!: UserService

  getOrdersByUserId(userId: string) {
    const user = this.userService.getUser(userId)
    return [{ id: '1', userId, product: 'Widget' }]
  }
}
```

## Best Practices

### 1. Break Cycles with @InjectLazy

```typescript
// ✅ Good: Break cycle with @InjectLazy
@Injectable()
class ServiceA {
  @InjectLazy(ServiceB)
  private accessor serviceB!: Promise<ServiceB>

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

// ❌ Avoid: Both sides using eager @Inject
@Injectable()
class ServiceA {
  @Inject(ServiceB) // Circular dependency error!
  private accessor serviceB!: ServiceB
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
 * We use @InjectLazy on ServiceA's side to break the cycle.
 */
@Injectable()
class ServiceA {
  @InjectLazy(ServiceB)
  private accessor serviceB!: Promise<ServiceB>
}
```

## Common Patterns

### Mediator Pattern

Instead of services depending on each other, use a mediator:

```typescript
@Injectable()
class MediatorService {
  @Inject(UserService)
  private accessor userService!: UserService
  @Inject(OrderService)
  private accessor orderService!: OrderService

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
  @Inject(EventBus)
  private accessor eventBus!: EventBus

  createUser(userData: any) {
    const user = { id: '1', ...userData }
    this.eventBus.emit('user.created', user)
    return user
  }
}

@Injectable()
class OrderService {
  @Inject(EventBus)
  private accessor eventBus!: EventBus
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

**Solution**: Use `@InjectLazy` on at least one side of the cycle.

### Error: "Maximum call stack size exceeded"

**Problem**: Circular dependency not properly resolved.

**Solution**: Ensure you're using `@InjectLazy` and awaiting the resulting `Promise` properly.

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
