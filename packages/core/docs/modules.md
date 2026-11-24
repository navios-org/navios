# Modules

A module is a group of routes with a shared path prefix, shared guards and shared interceptors. It is not a dependency-injection boundary.

```ts
import { Module, provide } from '@navios/core'

@Module({
  prefix: '/users',
  imports: [AuditModule],
  controllers: [UsersController],
  guards: [AuthGuard],
  interceptors: [TimingInterceptor],
  providers: [provide(UserStore, PgUserStore)],
  requestValues: [CurrentUser],
})
export class UsersModule {}
```

Every option is optional. The application is created from one root module, and every module reachable through `imports` is part of it.

## `prefix`

A route's path is the application's `globalPrefix`, then the prefix of each importing module from the outermost inwards, then the module's own prefix, then the endpoint's `url`. Leading and trailing slashes are normalised, so `'users'` and `'/users/'` mean the same.

```ts
@Module({ prefix: 't', controllers: [DeepController] }) // GET /deep
class T {}

@Module({ prefix: '/api', imports: [T] })
class Root {}

// With globalPrefix: 'v1' the route is GET /v1/api/t/deep
```

A prefix may have URL parameters, for example `prefix: '/orgs/$orgId'`. They are in `ctx.urlParams` for guards, interceptors and handlers, and in the handler's `urlParams` next to the endpoint's own. The types of `urlParams` come from the endpoint alone and do not include them, so read them from `ctx.urlParams`.

A module that has controllers and is reached under two different prefixes fails at `init()`, because its routes would exist twice. A module without controllers may be imported from anywhere.

## `guards` and `interceptors`

A module's guards and interceptors apply to its own routes and to the routes of every module it imports, directly or indirectly.

When a module is reached through several import paths, its routes get the union of the guards along all of them:

```ts
@Module({ imports: [Shared], guards: [G1] })
class A {}

@Module({ imports: [Shared], guards: [G2] })
class B {}

@Module({ imports: [A, B] })
class Root {}

// Routes of Shared, and of the modules Shared imports, run G1 and G2.
```

The effective lists are computed per application at `init()`. Nothing is written back to the classes, so two applications in one process that import the same module under different parents do not affect each other, and the result does not depend on the order in which files are imported.

`@UseGuards` and `@UseInterceptors` above `@Module` add to the same lists.

## `requestValues`

[Request values](./request-state.md#building-a-value-at-boot) to build while the application initialises.

## `providers`

`providers` is a list of `provide(token, implementation)` entries that say what a token or class resolves to:

```ts
@Module({
  providers: [
    provide(UserStore, PgUserStore), // a class
    provide(Greeting, { value: 'hello' }), // a value
    provide(Clock, { factory: () => new SystemClock() }), // a factory
  ],
})
export class AppModule {}
```

Providers are application-wide. Modules do not encapsulate them: a provider listed in any module is visible to every service in the application, and a service does not have to be listed anywhere to be injectable. A class decorated with `@Injectable()` is resolvable by being imported.

The reason is that a module in Navios is a route group and an application has exactly one container. There are no per-module containers, so there is nothing for a provider to be private to.

Precedence when the same token is provided more than once:

1. The application's `providers` option wins over every module.
2. Between modules, the first one in initialisation order wins, and an imported module is initialised before the module that imports it.

Relying on rule 2 is fragile. Provide a token in one place.

`@Module({ overrides })` and `@Injectable({ priority })` from 1.x are gone; `provide()` replaces both.

## `onModuleInit`

A module class is instantiated once, as a singleton, and may implement `onModuleInit()`:

```ts
import type { OnModuleInit } from '@navios/core'

@Module({ imports: [DatabaseModule] })
export class AppModule implements OnModuleInit {
  private readonly migrations = inject(Migrations)

  async onModuleInit() {
    await this.migrations.run()
  }
}
```

Hooks run one at a time, in dependency order: a module's hook runs after the hooks of everything it imports. They run before controllers are created and routes are compiled.

## Modules added by plugins

A plugin can add a module with `api.addModule(SomeModule)`. It is treated as an additional root: it gets the global prefix but no prefix or guards from the application's root module. See [Plugins](./plugins.md).
