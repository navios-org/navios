# Server and DI docs redesign

Follow-up to `2026-11-24-builder-docs-redesign-design.md`. That document's writing rules apply here
unchanged; this one records what is specific to the Server and DI sections.

## Intent

`next` carries the 2.0 rewrite of `@navios/di`, `@navios/core`, the adapters, JWT, Schedule, OpenAPI
and OpenTelemetry. The site under `apps/docs/content/docs/{server,di}` still describes 1.x and
repeats itself (93 pages, about 15,600 lines). Rebuild both sections around what a developer does,
in the order they do it, with every fact in one place and every example matching 2.0.

## Goals

- A reader can go from nothing to a running, tested server by reading the three top pages and the
  Essentials group in order.
- Every API named on the site exists in the 2.0 packages. Examples are type-checked.
- One home page per fact. Other pages link to it.
- Old URLs redirect.

## Non-goals

- Commander and Queues docs.
- Package READMEs, `packages/*/docs`, CHANGELOGs and package source. Problems found in them are
  reported, not fixed.
- `@navios/cli` hot reload. The CLI was not ported in the 2.0 work, so the old recipe is dropped
  rather than rewritten from guesswork.

## Anti-goals

- A page that documents a 1.x name outside the two migration pages.
- "Best practices", "Common mistakes", "FAQ" or "Next steps" tails.
- A warning that Bun needs a plugin or legacy decorators. Bun runs standard decorators natively
  (`examples/e2e-bun-stage3`); the legacy entry point is only for projects that keep
  `experimentalDecorators` on by choice.
- A statement that the server needs Zod. Core 2.0 accepts any Standard Schema.

## Approaches

1. **Two sections, Server and DI, each shaped like Builder** (chosen). DI is used without the
   server (React, Commander, browser), so it keeps its own section. JWT, Schedule, OpenAPI and
   OpenTelemetry are one to three pages each and live inside Server.
2. Fold DI into Server. Rejected: hides DI from non-server users.
3. A top-level section per package. Rejected: sections of one page.

## Sources of truth

In order: package source and tests, `packages/core/docs/*.md`, `packages/di/docs/*.md`, the package
READMEs (`adapter-fastify`, `adapter-bun`, `adapter-xml`, `jwt`, `schedule`, `openapi`, `otel`,
`di-react`), and the apps in `examples/`. The old site pages are a source of topics only, never of
API.

## Page tree

Paths are relative to `apps/docs/content/docs`. A page's URL is its path without `.md`, under
`/docs/`; an `index.md` is its folder.

### Server (30 pages)

| File | Title | Owns |
| --- | --- | --- |
| `server/index.md` | Introduction | What Navios server is, what the packages are, who it is for |
| `server/quick-start.md` | Quick start | Install, declare, service, controller, module, `listen`, curl |
| `server/request-lifecycle.md` | How a request is handled | The pipeline in order, as one diagram: route match, interceptors (which wrap everything after them), guards, body read and validation, handler, response validation and encoding, error mapping |
| `server/essentials/controllers.md` | Controllers and handlers | `@Controller`, `@Endpoint`, `HandlerParams`, `HandlerResult`, return values, `reply()`, declared statuses and error bodies, request and response validation, `handler()`, route rules checked at `init()` |
| `server/essentials/request-context.md` | Request context | `RequestContext`: headers, cookies, signal, reply controls, `onFinish`, `ctx.raw`, `Register`, `currentContext()` |
| `server/essentials/services.md` | Services and injection | `@Injectable`, `inject`, scopes in a server, `providers` at a glance. Links to DI for everything else |
| `server/essentials/modules.md` | Modules | `@Module` options, prefixes, module guards, providers, `onModuleInit` |
| `server/essentials/guards-and-interceptors.md` | Guards and interceptors | `Guard`, `canActivate`, interceptors, attaching, order |
| `server/essentials/errors.md` | Errors | problem+json, `HttpException` classes, `app.mapError`, `exposeErrorDetails`, validation error body, responders |
| `server/essentials/application.md` | Application setup | `NaviosFactory.create` options, `init`, `listen`, `close`, hooks, shutdown |
| `server/essentials/config-and-logging.md` | Configuration and logging | Config service, logger |
| `server/essentials/testing.md` | Testing | In-memory adapter, `createTestClient`, `app.inject`, replacing dependencies, testing a guard alone |
| `server/guides/authentication.md` | Authentication with JWT | `@navios/jwt` end to end: `provideJwtService`, sign, verify, an auth guard, `CurrentUser` key, a `Public` attribute, error classes |
| `server/guides/request-state.md` | Per-request state | Context keys, `@RequestValue`, request-scoped services and `ctx.use` |
| `server/guides/file-uploads.md` | File uploads | Multipart handlers, limits, adapter option. Links to Builder for the declaration |
| `server/guides/streams-and-sse.md` | Streams and server-sent events | `'stream'`, `'text'`, `'blob'` handlers, `sse()`, `sseStream()` |
| `server/guides/scheduled-jobs.md` | Scheduled jobs | `@navios/schedule`: `@Schedulable`, `@Cron`, `schedulePlugin`, per-run scope, runtime control, errors |
| `server/guides/openapi.md` | OpenAPI | `@navios/openapi` plugin, options, what is documented, attributes |
| `server/guides/attributes.md` | Attributes | `AttributeFactory`, applying, reading from `ctx.route` |
| `server/guides/plugins.md` | Plugins | `definePlugin`, the plugin API, routes, native server, response encoders |
| `server/guides/prisma.md` | Prisma | A Prisma client as a service with lifecycle hooks, per-request transactions |
| `server/adapters/fastify.md` | Fastify | Options, `Register`, `ctx.raw`, taking over the response, CORS, multipart, shutdown |
| `server/adapters/bun.md` | Bun | Options, `Register`, `ctx.raw`, CORS, multipart, shutdown |
| `server/adapters/xml.md` | XML responses | `@navios/adapter-xml`: plugin, JSX setup, components, tags, CDATA |
| `server/adapters/writing-an-adapter.md` | Writing an adapter | `HttpAdapter` contract, `RouteInput`, `RouteResult`, conformance suite |
| `server/opentelemetry/index.md` | Setup | `@navios/otel`: install, plugin, configuration, exporters, HTTP spans, propagation, shutdown |
| `server/opentelemetry/tracing.md` | Tracing services and custom spans | `@Traced`, `@Traceable`, options, custom spans, testing |
| `server/reference/legacy-decorators.md` | Legacy decorators | The `legacy-compat` entry points of core, DI and Schedule |
| `server/reference/migrating-to-2.md` | Migrating to 2.0 | The only Server page that names 1.x APIs. Covers core, adapters, JWT, Schedule, OpenAPI, OTel, XML |
| `server/reference/migrating-from-nestjs.md` | Migrating from NestJS | Concept map and the differences that bite |

### DI (18 pages)

| File | Title | Owns |
| --- | --- | --- |
| `di/index.md` | Introduction | What it is, design principles, where it is used |
| `di/quick-start.md` | Quick start | Install, tsconfig, two services, a container, `get` |
| `di/how-it-works.md` | How resolution works | Token to provider to instance, sync-first resolution, when it becomes async, constructor replay |
| `di/essentials/services.md` | Services and injection | `@Injectable` options, `inject`, `optional`, `asyncInject`, `registerInjectable` |
| `di/essentials/tokens.md` | Tokens | `InjectionToken.create`, schemas (Standard Schema), `bound`, `factory`, `refineType` |
| `di/essentials/providers.md` | Providers | `provide`, `container.provide`, lookup order, `addInstance`, `decorate`, `strict`, `getProvider` |
| `di/essentials/scopes.md` | Scopes | Singleton, transient, request; `createScope`, `ScopedContainer`, `ScopeMismatchError` |
| `di/essentials/lifecycle.md` | Lifecycle | `onServiceInit`, `onServiceDestroy`, destruction order, `dispose`, `ready` |
| `di/essentials/factories.md` | Factories | `@Factory`, `create(ctx, args)`, `FactoryContext`, function providers, `registerFactory` |
| `di/guides/testing.md` | Testing | Fresh container per test, `provide` overrides, `TestContainer`, `UnitTestContainer` |
| `di/guides/circular-dependencies.md` | Circular dependencies | Detection, the error, `asyncInject` |
| `di/guides/invalidation.md` | Invalidation | `invalidate`, `onInvalidate`, what is rebuilt |
| `di/react/index.md` | Quick start | `@navios/di-react`: `ContainerProvider`, `useService` |
| `di/react/using-services.md` | Using services in components | `useService`, `useSuspenseService`, `useOptionalService`, args, errors |
| `di/react/scopes-and-invalidation.md` | Scopes and invalidation | `ScopeProvider`, scope hooks, `useInvalidateInstance` |
| `di/reference/api.md` | API | Every export of `@navios/di` and `@navios/di/testing`, error codes |
| `di/reference/react-api.md` | React API | Every export of `@navios/di-react` |
| `di/reference/migrating-to-2.md` | Migrating to 2.0 | The only DI page that names 1.x APIs |

## One example

Server pages continue the Builder Quick start: `API`, `userSchema`, `getUser` (`GET
/users/$userId`) and `createUser`. `server/quick-start.md` shows those declarations once (with a
404 `errorSchema` on `getUser` and `responses: { 201 }` on `createUser`) plus `UsersService`,
`UsersController` and `AppModule`. Later pages refer to them with a one-line comment instead of
redeclaring them, and introduce a new endpoint only when the topic needs one.

DI pages use one pair throughout: `DatabaseService` and `UserService`, introduced in
`di/quick-start.md`.

## Writing rules (in addition to the Builder design)

- Code blocks are `ts` or `tsx`, no semicolons, single quotes, `.mjs` import specifiers, `zod/v4`.
- Server code imports DI names from `@navios/core`. DI pages import from `@navios/di`.
- A table that enumerates something (error classes, application options, plugin API methods, error
  codes, hooks) appears on its owner page only.
- Links are absolute site paths (`/docs/server/essentials/errors#responders`). Every link in this
  design's tree is valid; a link to a heading must match a heading that exists.
- Admonitions use Rspress syntax: `:::tip`, `:::info`, `:::warning`, `:::danger`.
- Plain, direct prose. No marketing, no emoji.
- Client-side facts stay in Builder. The Builder page `builder/guides/navios-server` stays the home
  of the shared-contract pattern; its Zod warning is removed and its handler examples are brought
  to 2.0.

## Site plumbing

- `apps/docs/sidebars.mts`: replace the `server` and `di` entries with the groups above.
- `apps/docs/scripts/renamed-pages.mts`: a redirect for every old URL that no longer exists.
- `apps/docs/scripts/url-baseline.txt`: add the new URLs.
- Links into the old pages from Builder, Commander and the landing page are repointed.

## Verification

- `yarn turbo run build --filter=@navios/docs` passes (dead links and anchors fail it).
- `node scripts/check-urls.mts build` passes.
- Every example that can be compiled is compiled against the built packages in a throwaway
  directory that is not committed. What was only read is listed in the PR description.
- `grep` finds no 1.x names outside the migration pages.

## Left to the builder

Section headings inside a page, which secondary examples to keep, and how much of each old recipe
survives as a section of a guide.
