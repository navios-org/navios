# Service Scopes

A scope decides how long an instance lives and who shares it. Navios DI has three scopes: singleton, transient and request.

## Overview

| Scope       | Instances                              | Stored in          | Destroyed when                         |
| ----------- | -------------------------------------- | ------------------ | -------------------------------------- |
| `Singleton` | one per container                      | the root container | the container is disposed              |
| `Request`   | one per scope from `createScope()`     | the scope          | the scope is disposed                  |
| `Transient` | a new one for each injection or `get()` | its owner          | its owner is destroyed                 |

A service is always built in the scope it declares. The scope is never changed automatically.

## Singleton Scope

Singleton is the default. One instance exists per container and is shared by everything resolved from that container and its scopes.

### Basic Usage

```ts
import { Container, Injectable, InjectableScope } from '@navios/di'

@Injectable() // same as @Injectable({ scope: InjectableScope.Singleton })
class ConnectionPool {
  private readonly connections = new Map<string, Connection>()
}

const container = new Container()
const pool1 = await container.get(ConnectionPool)
const pool2 = await container.get(ConnectionPool)

console.log(pool1 === pool2) // true
```

### Singleton Behavior

- Two containers have separate singletons.
- A singleton requested through a scope is built against the root container and stored there. The scope's own values are not visible to it.
- Concurrent `get()` calls for a singleton that is still initialising all receive the same instance.

```ts
const Value = InjectionToken.create<string>('Value')

@Injectable()
class Reader {
  readonly value = inject(Value)
}

const container = new Container()
container.addInstance(Value, 'root')

const scope = container.createScope()
scope.addInstance(Value, 'scoped')

console.log(await scope.get(Value)) // 'scoped'
console.log((await scope.get(Reader)).value) // 'root'
```

## Transient Scope

A transient service gets a new instance for each `inject()` call and each `get()`.

### Basic Usage

```ts
import { Container, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class QueryBuilder {
  private readonly parts: string[] = []

  where(clause: string) {
    this.parts.push(clause)
    return this
  }
}

const container = new Container()
const a = await container.get(QueryBuilder)
const b = await container.get(QueryBuilder)

console.log(a === b) // false
```

### Injecting Transients

`inject()` returns a real transient instance. Each call gets its own:

```ts
@Injectable()
class ReportService {
  private readonly summary = inject(QueryBuilder)
  private readonly details = inject(QueryBuilder)
  // summary !== details
}
```

A transient injected into a singleton is created once, when the singleton is constructed, and lives as long as the singleton. If a method needs a new instance on every call, inject the container and resolve the transient there:

```ts
@Injectable()
class ReportService {
  private readonly container = inject(Container)

  build() {
    const query = this.container.getSync(QueryBuilder)
    return query.where('active = true')
  }
}
```

Transients resolved directly from the root container are not tracked: the container does not call their `onServiceDestroy()`.

### Transient Dependencies

A transient is built in the context of whatever asked for it. Injected into a request-scoped service, it can use request-scoped services. Injected into a singleton, it cannot.

```ts
@Injectable({ scope: InjectableScope.Request })
class RequestState {}

@Injectable({ scope: InjectableScope.Transient })
class Worker {
  private readonly state = inject(RequestState)
}

const scope = container.createScope()
const w1 = await scope.get(Worker)
const w2 = await scope.get(Worker)
// w1 !== w2, but both share the scope's RequestState
```

## Request Scope

A request-scoped service has one instance per scope. A scope is created with `container.createScope()` and usually corresponds to one HTTP request, job or message.

### Basic Usage

```ts
import { Container, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestState {
  readonly startedAt = Date.now()
}

const container = new Container()

await using scope = container.createScope()
const a = await scope.get(RequestState)
const b = await scope.get(RequestState)

console.log(a === b) // true
```

### Request Scope with Dependencies

A request-scoped service may inject singletons, other request-scoped services and transients:

```ts
@Injectable()
class Logger {}

@Injectable({ scope: InjectableScope.Request })
class RequestState {}

@Injectable({ scope: InjectableScope.Request })
class OrderHandler {
  private readonly logger = inject(Logger) // shared by all scopes
  private readonly state = inject(RequestState) // shared within this scope
}
```

### Multiple Concurrent Scopes

Scopes are independent of each other:

```ts
const first = container.createScope()
const second = container.createScope()

const [a, b] = await Promise.all([first.get(RequestState), second.get(RequestState)])
console.log(a === b) // false

await Promise.all([first.dispose(), second.dispose()])
```

Scopes do not rely on `AsyncLocalStorage` or any ambient context. A request-scoped service is found through the scope object it is resolved from, so pass the scope to the code that needs it.

See [Scoped Containers](./request-contexts.md) for the scope API.

## Scope Rules

A service can only depend on services that live at least as long as it does.

| Consumer  | Singleton | Request | Transient                                  |
| --------- | --------- | ------- | ------------------------------------------ |
| Singleton | yes       | **no**  | yes, if the transient needs nothing scoped |
| Request   | yes       | yes     | yes                                        |
| Transient | yes       | same as the service that injects it | yes            |

### ScopeMismatchError

A singleton that injects a request-scoped service fails with a `DIError` with code `ScopeMismatchError`. The message names the full path:

```ts
@Injectable({ scope: InjectableScope.Request })
class RequestState {}

@Injectable()
class AuditService {
  private readonly state = inject(RequestState)
}

await scope.get(AuditService)
// Scope mismatch: RequestState is request-scoped and cannot be resolved from the root
// container (AuditService -> RequestState). Resolve it from a scope created with
// container.createScope(), and do not inject it into a singleton.
```

The error is the same whether `AuditService` is requested from the root container or from a scope, and whether it uses `inject()` or `optional()`. A transient in between does not hide the problem:

```ts
@Injectable({ scope: InjectableScope.Transient })
class Middle {
  private readonly state = inject(RequestState)
}

@Injectable()
class AuditService {
  private readonly middle = inject(Middle)
}
// Scope mismatch: ... (AuditService -> Middle -> RequestState)
```

Resolving a request-scoped service directly from the root container is the same error.

In 1.x a singleton in this position was silently turned into a request-scoped service. That no longer happens.

### What to do instead

Choose one of these:

1. **Make the consumer request-scoped.** If the service needs per-request state to do its work, it is per-request itself.

   ```ts
   @Injectable({ scope: InjectableScope.Request })
   class AuditService {
     private readonly state = inject(RequestState)
   }
   ```

2. **Pass the value as an argument.** Keep the singleton and hand the request-scoped object to the method that needs it.

   ```ts
   @Injectable()
   class AuditService {
     record(state: RequestState, action: string) {}
   }

   const audit = await scope.get(AuditService)
   audit.record(await scope.get(RequestState), 'login')
   ```

3. **Split the service.** Move the part that needs request state into a request-scoped service that injects the singleton part.

## Real-World Examples

### Singleton: Database Connection Pool

```ts
@Injectable()
class DatabasePool implements OnServiceInit, OnServiceDestroy {
  private pool: Pool | null = null

  async onServiceInit() {
    this.pool = await createPool({ max: 10 })
  }

  async onServiceDestroy() {
    await this.pool?.end()
  }

  query(sql: string) {
    return this.pool!.query(sql)
  }
}
```

### Request: Unit of Work

```ts
@Injectable({ scope: InjectableScope.Request })
class UnitOfWork implements OnServiceDestroy {
  private readonly pool = inject(DatabasePool)
  private readonly pending: string[] = []

  add(sql: string) {
    this.pending.push(sql)
  }

  async commit() {
    for (const sql of this.pending.splice(0)) {
      await this.pool.query(sql)
    }
  }

  onServiceDestroy() {
    this.pending.length = 0
  }
}
```

### Mixed Scopes

```ts
@Injectable({ scope: InjectableScope.Transient })
class Stopwatch {
  private readonly startedAt = performance.now()

  elapsed() {
    return performance.now() - this.startedAt
  }
}

@Injectable({ scope: InjectableScope.Request })
class OrderHandler {
  private readonly pool = inject(DatabasePool) // singleton
  private readonly unitOfWork = inject(UnitOfWork) // request
  private readonly stopwatch = inject(Stopwatch) // transient, owned by this handler

  async handle(order: Order) {
    this.unitOfWork.add(order.toInsertStatement())
    await this.unitOfWork.commit()
    return this.stopwatch.elapsed()
  }
}

async function handleRequest(container: Container, order: Order) {
  await using scope = container.createScope()
  const handler = await scope.get(OrderHandler)
  return handler.handle(order)
}
```

## Best Practices

### 1. Use singleton for stateless services and shared resources

Connection pools, clients, caches and pure services are created once.

### 2. Use request scope for per-request state

User identity, a transaction, a per-request cache. Everything that needs that state is request-scoped too.

### 3. Use transient for short-lived, stateful helpers

Builders, stopwatches, buffers. Remember that a transient injected into a singleton lives as long as the singleton.

### 4. Do not store per-request data in a singleton

```ts
// Wrong: every request overwrites the same field
@Injectable()
class CurrentUser {
  userId: string | null = null
}

// Right
@Injectable({ scope: InjectableScope.Request })
class CurrentUser {
  userId: string | null = null
}
```

### 5. Always dispose scopes

A scope that is never disposed keeps its instances alive and never runs their `onServiceDestroy()` hooks. Use `await using` or `try`/`finally`.

## API Reference

### InjectableScope Enum

```ts
enum InjectableScope {
  Singleton = 'Singleton',
  Transient = 'Transient',
  Request = 'Request',
}
```

### Scope Configuration

```ts
@Injectable({ scope: InjectableScope.Singleton })
@Injectable({ scope: InjectableScope.Transient })
@Injectable({ scope: InjectableScope.Request })

@Factory({ scope: InjectableScope.Transient })

provide(Token, { class: Impl, scope: InjectableScope.Request })
InjectionToken.create<T>('Name', { scope: InjectableScope.Request })
```
