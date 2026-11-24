# @navios/core documentation

These pages describe `@navios/core` 2.0. If you are upgrading an application, start with the [migration guide](./migration.md).

## Start here

- [Quick start](./quick-start.md): install, declare an endpoint, serve it, run it.

## Writing an application

- [Controllers and handlers](./controllers.md): `@Endpoint` handlers, `reply()`, declared statuses, streams, multipart, server-sent events, and `handler()` for code without decorators.
- [Request context](./request-context.md): headers, cookies, the abort signal, reply controls, `ctx.raw` and the `Register` declaration.
- [Per-request state](./request-state.md): context keys, `@RequestValue`, and request-scoped services.
- [Guards and interceptors](./guards-and-interceptors.md)
- [Attributes](./attributes.md): typed metadata on modules, controllers and handlers.
- [Modules](./modules.md): prefixes, guards, providers.
- [Errors](./errors.md): problem+json, `HttpException`, `app.mapError`, responders.
- [Application setup and lifecycle](./application.md): options, `init`, `listen`, `close`, hooks.
- [Plugins](./plugins.md): `definePlugin`.
- [Config and logger](./config-and-logger.md)

## Testing

- [Testing](./testing.md): the in-memory adapter, `createTestClient`, `app.inject`, DI test containers.

## Other

- [Writing an adapter](./writing-an-adapter.md): the `HttpAdapter` contract and the conformance suite.
- [Legacy decorators](./legacy-decorators.md): `experimentalDecorators` projects.
- [Migrating from 1.x](./migration.md)

Dependency injection (`@Injectable`, `inject`, `provide`, scopes, lifecycle hooks of services) is documented in `@navios/di`. `@navios/core` re-exports everything from `@navios/di`, so an application imports both from `@navios/core`.
