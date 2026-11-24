---
sidebar_position: 0
title: Why Navios?
---

# Why Navios?

Navios is an enterprise-grade TypeScript framework designed for teams that need reliability, performance, and maintainability at scale.

## Contract-First Development

Navios is built around **API contracts** - shared definitions between frontend and backend that guarantee type safety across your entire stack.

```typescript
// Define once, use everywhere
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
})

// Server: Full type inference
@Endpoint(getUser)
async getUser(params: EndpointParams<typeof getUser>) {
  return this.userService.findById(params.urlParams.userId)
}

// Client: Same types, zero duplication
const user = await client.call(getUser, { userId: '123' })
```

**Benefits:**
- Single source of truth for API shapes
- Breaking changes caught at compile time
- Frontend and backend always in sync
- Auto-generated documentation from schemas

## True Type Safety

Most frameworks validate incoming requests but trust your code to return correct responses. Navios validates **both directions**:

| Validation | NestJS | Navios |
|------------|--------|--------|
| Request body | ✅ | ✅ |
| Query parameters | ✅ | ✅ |
| URL parameters | ⚠️ Manual | ✅ Auto |
| Response body | ❌ | ✅ |
| Response types | ❌ | ✅ |

Response validation catches bugs before they reach production - if your handler returns malformed data, you'll know immediately.

## Performance

Navios delivers exceptional performance through efficient design and adapter choice:

| Setup | Requests/sec | vs NestJS |
|-------|-------------|-----------|
| Navios + Fastify | ~45,000 | **2.5x faster** |
| Navios + Bun | ~120,000 | **6x faster** |
| NestJS + Express | ~18,000 | baseline |

**Why it's fast:**
- Minimal abstraction overhead
- Fastify's high-performance routing (not Express)
- Optional Bun runtime for maximum throughput
- No reflection-based metadata at runtime

## Modern Dependency Injection

NestJS relies on experimental TypeScript decorators and `reflect-metadata` for DI, requiring constructor injection with explicit `@Inject()` decorators.

Navios uses **native ES decorators** (Node 20+) with a simpler approach:

```typescript
// NestJS - constructor injection, decorator boilerplate
@Injectable()
class UserService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(Logger) private logger: Logger,
  ) {}
}

// Navios - property injection, no boilerplate
@Injectable()
class UserService {
  private db = inject(DatabaseService)
  private logger = inject(Logger, { context: 'UserService' })
}
```

**Problems Navios solves:**
- No `@Inject()` decorator on every dependency
- No constructor parameter ordering issues
- No circular dependency errors from hoisting
- No experimental decorators or `emitDecoratorMetadata`
- Clear service scopes (singleton, request, transient)

## Simple Module System

NestJS modules have a steep learning curve with providers, exports, dynamic modules, and global scope. Navios keeps it simple:

```typescript
// NestJS - complex module configuration
@Module({
  imports: [
    TypeOrmModule.forRoot({ ... }),
    TypeOrmModule.forFeature([User]),
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  controllers: [UserController],
  providers: [UserService, UserRepository, ...],
  exports: [UserService],
})
class UserModule {}

// Navios - straightforward module
@Module({
  controllers: [UserController],
  imports: [DatabaseModule],
  guards: [AuthGuard],
})
class UserModule {}
```

**Problems Navios solves:**
- No `providers` array - services are auto-discovered via DI
- No `exports` array - imported modules share their services
- No `forRoot()` / `forFeature()` patterns
- No global modules polluting the dependency graph
- No "Nest can't resolve dependencies" errors

## Configuration at the Right Level

In NestJS, every library implements its own `forRoot()` / `forFeature()` pattern with inconsistent APIs. Configuration happens at the module level, mixing concerns.

Navios configures services at the **injection level** using tokens, bound values, and factories:

```typescript
// NestJS - module-level configuration, each library different
@Module({
  imports: [
    TypeOrmModule.forRoot({ type: 'postgres', host: 'localhost', ... }),
    JwtModule.register({ secret: 'key', signOptions: { expiresIn: '1h' } }),
    CacheModule.registerAsync({ useFactory: () => ({ ttl: 300 }) }),
  ],
})
class AppModule {}

// Navios - consistent injection-level configuration

// 1. Define schema and create token
const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  username: z.string(),
  password: z.string(),
})

const DatabaseServiceToken = InjectionToken.create<
  DatabaseService,
  typeof databaseConfigSchema
>('DatabaseService', databaseConfigSchema)

// 2. Create factory that builds the service with config
@Factory({ token: DatabaseServiceToken })
class DatabaseServiceFactory implements FactorableWithArgs<DatabaseService, typeof databaseConfigSchema> {
  create(ctx: FactoryContext, config: z.infer<typeof databaseConfigSchema>) {
    return new DatabaseService(config.host, config.port, config.username, config.password)
  }
}

// 3. Three ways to get the same configured service:

// Option A: Pass config directly when injecting
@Injectable()
class UserRepository {
  private db = inject(DatabaseServiceToken, {
    host: 'localhost',
    port: 5432,
    username: 'admin',
    password: process.env.DB_PASSWORD,
  })
}

// Option B: Pre-bind config to a new token
const ProductionDbToken = InjectionToken.bound(DatabaseServiceToken, {
  host: 'prod-db.example.com',
  port: 5432,
  username: 'prod_user',
  password: process.env.DB_PASSWORD,
})

@Injectable()
class OrderRepository {
  private db = inject(ProductionDbToken) // No config needed - already bound
}

// Option C: Use factory token for dynamic config
const DynamicDbToken = InjectionToken.factory(DatabaseServiceToken, async () => {
  const secrets = await loadSecretsFromVault()
  return {
    host: secrets.DB_HOST,
    port: secrets.DB_PORT,
    username: secrets.DB_USER,
    password: secrets.DB_PASSWORD,
  }
})

@Injectable()
class PaymentRepository {
  private db = inject(DynamicDbToken) // Config resolved at runtime
}
```

**Why this matters:**
- **Schema validation** - Config is validated at runtime with Zod, catching errors early
- **Consistent API** - All configurable services follow the same token + factory pattern
- **Service-focused** - Configure what you inject, not where you import
- **Type-safe config** - Full TypeScript inference from schema to service
- **Testable** - Easy to inject different configs in tests

## Adapter Architecture

NestJS is tightly coupled to Express (with Fastify as an adapter). Navios is adapter-first:

```typescript
// Node.js + Fastify - Production ready
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

// Bun - Maximum performance
import { defineBunEnvironment } from '@navios/adapter-bun'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(), // or defineBunEnvironment()
})
```

Switch adapters without changing application code. Your controllers, services, and business logic remain the same.

## Developer Experience

Navios prioritizes clarity and productivity:

- **Explicit over implicit** - No hidden behaviors or magic
- **TypeScript-first** - Full inference, no type assertions needed
- **Minimal boilerplate** - Less ceremony, more functionality
- **Clear error messages** - Know exactly what went wrong and where
- **Hot reload** - Fast development cycle with `@navios/cli`

## Enterprise Ready

Built for production workloads:

- **Testable** - First-class testing support with `createTestingModule`
- **Observable** - Built-in structured logging with customizable levels
- **Configurable** - Type-safe configuration with environment support
- **Maintainable** - Clean architecture patterns that scale with your team
- **Documented** - Comprehensive guides and API references

## When to Choose Navios

**Navios is ideal for:**
- Teams building APIs consumed by TypeScript frontends
- Projects requiring strict type safety guarantees
- High-performance API servers
- Applications that will grow and need maintainable architecture
- Teams frustrated with NestJS complexity or performance

**Consider NestJS if:**
- You need extensive third-party integrations (larger ecosystem)
- Your team is already proficient with NestJS patterns
- You need GraphQL, WebSockets, or microservices out of the box

## Getting Started

Ready to try Navios?

```bash
npm install @navios/core @navios/adapter-fastify @navios/builder zod
```

Continue to the [Getting Started guide](/docs/server/getting-started) to build your first endpoint in minutes.
