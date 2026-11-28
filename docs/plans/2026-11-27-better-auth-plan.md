# @navios/better-auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lab package that mounts Better Auth in a Navios 2.0 application with the instance built by DI, and that keeps Better Auth's CLI working, plus an SQLite example.

**Architecture:** `provideBetterAuth` is a DI factory token. `betterAuthPlugin` adds parameter routes per depth that forward a Web `Request` to `auth.handler`, and returns its `Response` through a custom result kind and encoder. Sessions are a lazy request value with a guard on top. `authForCli` builds the application without transports for the CLI's config loader.

**Tech Stack:** TypeScript (`.mts`), `@navios/server` 2.0.0-alpha.1, `better-auth` 1.7.x, `auth` 1.7.x (CLI, example only), `node:sqlite`, Vitest 5 with `unplugin-swc`, tsdown.

**Spec:** `docs/plans/2026-11-27-better-auth-design.md`

## Global Constraints

- Package path `lab-packages/better-auth`, name `@navios/better-auth`, `"private": true`, version `2.0.0-alpha.2`, CHANGELOG heading `## [2.0.0-alpha.2] - Unreleased`.
- Peers: `@navios/server: workspace:*`, `better-auth: ^1.7.0`. No import of `@navios/di`; DI comes from `@navios/server` re-exports.
- No decorator syntax in package sources (register functions only), so the build needs no decorator transform.
- `.mts` files, `.mjs` specifiers, no semicolons, single quotes; `yarn turbo run lint --filter=@navios/better-auth` after changes.
- Tests: fresh application per test, closed in `afterEach`; `node:sqlite` `:memory:` databases; `telemetry: { enabled: false }`.
- Default plugin values: `path = '/api/auth'`, `methods = ['GET', 'POST']`, `depth = 6`.
- Custom result kind `'better-auth'`; OpenAPI exclusion token `Symbol.for('navios:openapi:exclude')`.

## Review Focus

- A POST with a non-JSON body (form-urlencoded) must reach Better Auth byte for byte. Task 2 tests it with an echo endpoint.
- A response with two `set-cookie` headers must arrive as two cookies, not one comma-joined line. Task 2.
- A query string must survive forwarding (`?callbackURL=`). Task 2.
- A global prefix that makes the public path differ from Better Auth's base path must fail at start-up, not turn every auth call into a 404. Task 3.
- Two requests with different sessions must not see each other's session: the request value is per request. Task 4.

---

### Task 1: Package scaffold and `provideBetterAuth`

**Files:**

- Delete: everything in `lab-packages/better-auth` (old experiment)
- Create: `lab-packages/better-auth/{package.json,tsconfig.json,tsconfig.lib.json?,tsdown.config.mts,vitest.config.mts,turbo.json,LICENSE,CHANGELOG.md}`
- Create: `lab-packages/better-auth/src/{index.mts,provide-better-auth.mts}`
- Modify: `tsconfig.json` (root references: replace nothing, add `lab-packages/better-auth`)
- Test: `lab-packages/better-auth/src/__tests__/provide-better-auth.spec.mts`, `src/__tests__/helpers.mts` (in-memory database with migrations)

**Interfaces:**

- Produces: `provideBetterAuth<Options extends BetterAuthOptions>(config: Options | ((ctx: FactoryContext) => Options | Promise<Options>), options?: { name?: string }): InjectionToken<Auth<Options>, undefined>`, token name `'BetterAuth'` by default.
- Produces (tests): `createTestDatabase(): DatabaseSync` and `migrate(auth: Auth): Promise<void>` (`(await auth.$context).runMigrations()`).

- [ ] Write tests: static options resolve to an instance with `handler` and `api`; the same instance on two `get`s; a factory receives `ctx` and can `ctx.inject` another token; an async factory works; two calls give two tokens and two instances; `name` shows in the token's string form.
- [ ] Run, see them fail; implement with `InjectionToken.create` and `registerFactory` (as `provideJwtService`); run, see them pass.

### Task 2: Plugin and forwarding

**Files:**

- Create: `src/better-auth-plugin.mts`, `src/internal/forward.mts` (`toWebRequest`, `toResult`), `src/better-auth-token.mts` (`BetterAuth` alias), `src/attributes.mts` (`AllowAnonymous`, internal `OpenApiExclude`)
- Test: `src/__tests__/better-auth-plugin.spec.mts`

**Interfaces:**

- Produces: `betterAuthPlugin(options: BetterAuthPluginOptions)`, where `BetterAuthPluginOptions = { auth: InjectionToken<Auth<any>, undefined>; path?: string; methods?: string[]; depth?: number }`; `BetterAuth: InjectionToken<Auth, undefined>`; `AllowAnonymous` attribute (flag).
- The controller class is created per setup; handler names `${method}_${depth}`.

- [ ] Write tests on the in-memory adapter with `app.inject`: sign-up `POST /api/auth/sign-up/email` gives 200, JSON and a `better-auth.session_token` cookie; `GET /api/auth/get-session` with that cookie returns the user; sign-out clears it; unknown `/api/auth/nope` is Better Auth's 404; a test Better Auth plugin (`createAuthEndpoint`) shows a 302 with `location`, two `set-cookie` values, the query string arriving, and a form-urlencoded body arriving byte for byte; an application route `GET /api/auth/me` (static) still wins over the parameter routes.
- [ ] Run, see them fail; implement. Request: `new Request(ctx.url, { method, headers: ctx.headers.toWebHeaders(), body, signal: ctx.signal })`, body from `ctx.rawBody()` only for non-GET/HEAD and non-empty. Response: headers without `set-cookie`, `content-length`, `transfer-encoding`, `connection`, `keep-alive`; `set-cookie` from `getSetCookie()` as a list; body bytes or `null`; `result('better-auth', body, { status, headers })`; encoder `(r) => ({ ...r, kind: 'blob' })`. Routes `{ config: { method, url, response: 'blob' } }` with attributes `[AllowAnonymous(), OpenApiExclude()]`; `api.provide(BetterAuth, { existing: options.auth })`.
- [ ] Run, see them pass.

### Task 3: Start-up checks

**Files:**

- Modify: `src/better-auth-plugin.mts` (`onBootstrap`)
- Create: `src/internal/base-path.mts` (`effectiveBasePath(auth): Promise<string>`, `servedPath(routes, controller): string`), `src/internal/endpoints.mts` (`unservedEndpoints(auth, methods, depth): string[]`)
- Test: `src/__tests__/startup-checks.spec.mts`

- [ ] Write tests: `globalPrefix: '/v1'` with default Better Auth options rejects `init()` with a message that names `/v1/api/auth`, `/api/auth` and `basePath`; the same with `basePath: '/v1/api/auth'` starts and serves; `baseURL: 'http://localhost/v1/api/auth'` counts as that base path; an endpoint declared with `method: 'PUT'` rejects naming `PUT` and `methods`; a path deeper than `depth` rejects naming `depth`; a non-HTTP-transport application rejects `setup`.
- [ ] Run, see them fail; implement; run, see them pass.

### Task 4: Sessions and the guard

**Files:**

- Create: `src/auth-session.mts` (`AuthSession`, `requireSession`), `src/better-auth-guard.mts`, `src/types.mts` (`BetterAuthRegister`, `RegisteredAuth`, `SessionOf<A>`, `AuthSessionData`)
- Test: `src/__tests__/session.spec.mts`, `src/__type-tests__/session.spec-d.mts`

**Interfaces:**

- Produces: `AuthSession` (request value, `resolve(ctx): Promise<AuthSessionData | null>`); `requireSession(ctx: RequestContext): Promise<AuthSessionData>`; `BetterAuthGuard` (Guard); `SessionOf<typeof Auth>` works on a token or an `Auth`.

- [ ] Write tests: guarded route without cookie answers 401 problem+json; with cookie 200 and the handler reads the user via `requireSession`; `AllowAnonymous` on a handler lets an anonymous request through and `ctx.get(AuthSession)` is `null` there; two users in sequence each see their own session; `getSession` is called once per request when guard and handler both read it. Type test: with no registration `AuthSessionData['user']` has `email: string`; `SessionOf<typeof Token>` of an instance with `user.additionalFields` includes the field.
- [ ] Run, see them fail; implement; run, see them pass.

### Task 5: `authForCli`

**Files:**

- Create: `src/auth-for-cli.mts`
- Test: `src/__tests__/auth-for-cli.spec.mts`

**Interfaces:**

- Produces: `authForCli<A>(token: InjectionToken<A, undefined>, options: { module: ClassType; providers?: Provider[]; logger?: ApplicationOptions['logger'] }): () => Promise<A>`; `logger` defaults to `false`.

- [ ] Write tests: returns a function; calling it gives an `Auth` with `options` and `$context`; a module's `providers` override is the one the factory receives; a module with controllers (HTTP options) still loads.
- [ ] Run, see them fail; implement with `createApplication(...).init()` then `app.get(token)`; run, see them pass.

### Task 6: Docs and build

**Files:** `lab-packages/better-auth/README.md`, `CHANGELOG.md`

- [ ] README: install, configure, plugin, sessions, guard, typing, CLI (the measured table, scripts for tsx and Bun, the decorator-free fallback), limits (no wildcard, `depth`, IP).
- [ ] `yarn turbo run build --filter=@navios/better-auth` passes (check, lint, test, build).

### Task 7: Example `examples/better-auth-sqlite`

**Files:**

- Create: `package.json`, `tsconfig.json`, `vitest.config.mts`, `.gitignore`, `.env.example`, `auth.config.mts`, `README.md`
- Create: `src/{app.config.mts,database.mts,auth.mts,notes/notes.api.mts,notes/notes.controller.mts,notes/notes.service.mts,app.module.mts,create-app.mts,main.mts}`
- Test: `e2e/cli.spec.mts`, `e2e/auth-flow.spec.mts`

- [ ] `e2e/cli.spec.mts`: with `DATABASE_PATH` a temp file, `node --import tsx/esm <auth bin> migrate --config auth.config.mts --yes` exits 0 and the file has `user`, `session`, `account`, `verification` and the example's `note` table untouched; `generate --output <tmp>.sql --yes` on an empty database writes `create table "user"`; plain `node <auth bin> migrate` fails (documents why the scripts exist).
- [ ] `e2e/auth-flow.spec.mts`: the application on Fastify, listening on port 0, database migrated through `authForCli`'s instance; sign-up, `GET /notes` 200 empty, `POST /notes` creates, another user sees none, `GET /notes` without cookie 401, sign-out then 401.
- [ ] `yarn turbo run test:ci --filter=better-auth-sqlite` passes; `yarn auth:migrate` and `yarn start` work by hand.
