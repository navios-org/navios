# @navios/better-auth: design

Status: experiment. Revised 2026-11-27 after review: `@navios/server` gained rest params, `ctx.toWebRequest()` and returned `Response`s, and the CLI and the example run on Bun. The calls marked "my call" are open to change.

## Intent

Make [Better Auth](https://www.better-auth.com) work in a Navios 2.0 application the Navios way. The auth instance is built by the DI container, so its configuration can inject services (a database, a mailer, a configuration service). It also has to keep working with Better Auth's own CLI (`npx auth generate | migrate | check | create-admin | info`), which generates and applies the database schema. The old `lab-packages/better-auth` and the draft `specs/drafts/navios-better-auth.md` are 1.x-era and are not built upon.

## What Better Auth needs from the host

- One fetch handler: `auth.handler(request: Request): Promise<Response>`, mounted under its `basePath` (`/api/auth` by default). It routes internally (better-call), returns 404 for unknown paths, and sets several `set-cookie` headers per response.
- Server-side calls: `auth.api.getSession({ headers })` and the rest of `auth.api`.
- A database. Version 1.7 accepts a `node:sqlite` `DatabaseSync` or a `bun:sqlite` `Database` directly, through its Kysely adapter. It checks the schema on the first request and throws `SchemaMismatchError` until it is migrated.

## The CLI question: do we need a wrapper?

The CLI (`auth`, version-locked to `better-auth`, 1.7.28 today) loads the config with c12:

1. It tries a native `import()` of the file first. Only when that fails does it fall back to jiti, with babel `preset-typescript` and no decorators plugin.
2. It reads `auth`, `default.auth` or `default` of the module. If that value is a function, c12 calls it and awaits the result.

Measured on Node 24.22 and Bun 1.4.5, with a config that imports a class using TC39 decorators through a `.mjs` specifier:

| How the CLI runs                               | Result                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npx auth migrate` (plain Node, jiti fallback) | Fails: jiti compiles the decorator in legacy form, so the TC39 `context` argument is `undefined`               |
| `node --import tsx/esm …/auth migrate`         | Works                                                                                                          |
| `node --import tsx …/auth migrate`             | Fails: tsx's CJS hook cannot resolve `@chevrotain/utils` (import-only exports), a dependency of the CLI itself |
| `bun --bun …/auth migrate`                     | Works                                                                                                          |

**Answer: no wrapper around their CLI.** All of its commands work unchanged, provided it runs where the application's decorators load. Bun does that itself: `bun --bun x auth <command> --config auth.config.mts` (`--bun`, or the bin's shebang starts Node). On Node, `--import tsx/esm` does the same. What is needed is a small adapter that turns the DI graph into what the CLI expects:

```ts
// auth.config.mts, read by the Better Auth CLI
import { authForCli } from '@navios/better-auth'
export default authForCli(Auth, { module: AppModule })
```

`authForCli` returns an async function. c12 calls it, it builds the application without transports (`createApplication`), initialises it and resolves the token.

Rejected:

- **A bin of ours that re-implements `generate` and `migrate`** with `auth/api` (`generateSchema`) and `better-auth/db/migration` (`getMigrations`). It loses `check`, `create-admin`, `info` and every later command, and drifts from their behaviour.
- **A bin that registers a loader and runs their CLI in process.** It saves one `NODE_OPTIONS` but has to locate `auth/dist/index.mjs`, a path their `exports` does not publish. It also has to pick a TypeScript loader for the user. It's easy to add later if the scripts prove annoying.
- **Keeping the Better Auth config out of DI** (a module-level `betterAuth()` in a decorator-free file, as the NestJS integration does). It works with plain `npx auth`, but the database and other dependencies are then wired twice. The README documents it as the fallback for projects that cannot run the CLI under tsx or Bun.

## Serving the routes

Navios route paths had no wildcard and an adapter had no raw mount. The first version of the plugin worked around it with parameter routes per depth (`$p1` … `$p6`, `GET` and `POST`) and a start-up check of every endpoint's method and depth.

The revision changes `@navios/server` instead, because three small features make any `fetch` handler mountable, not only Better Auth:

1. **Rest params.** `/api/auth/$path*` takes the rest of the path, one segment or more, each segment decoded. Fixed text and url params win over it at the first segment where routes differ, and it matches no empty or dot segment. Fastify serves it as `*`, Bun as `/*` (the value read from the path), srvx and the in-memory adapter through `RouteTable`. The builder fills it with its slashes kept, and OpenAPI writes it `{path}`.
2. **`ctx.toWebRequest()`.** On Bun and srvx it is the request the server received, untouched, while nothing has read its body (`RouteInput.webRequest()`); elsewhere it is built from the method, url, headers and body. This is the "injection into fetch" on Bun: Better Auth gets Bun's own `Request`.
3. **A returned `Response`** from a `stream`, `text` or `blob` endpoint is sent with its status, its headers over those of `ctx.reply`, every `set-cookie` of both, and its body streamed.

A raw mount that bypasses the pipeline on Bun was considered and rejected (my call): the auth routes would lose the application's interceptors (CORS, OTel), its prefix and its error format, for a saving that Better Auth's own database work dwarfs.

The plugin now declares `GET`, `POST`, `PUT`, `PATCH` and `DELETE` on `path/$path*` (`HEAD` is served by the `GET` route and asked as `GET`) and returns `auth.handler(await ctx.toWebRequest())`. At start-up it checks one thing, failing `init()` with advice: the path the routes are served at, with the prefixes, equals Better Auth's effective base path (the pathname of `$context.baseURL` when set, else `options.basePath`); the advice names `baseURL` when the configured URL has a path of its own. The routes carry `AllowAnonymous` and the OpenAPI exclusion attribute (`Symbol.for('navios:openapi:exclude')`, no dependency on `@navios/openapi`).

## Package API

Lives in `lab-packages/better-auth` (my call: `lab-packages/` is this repo's place for experiments, and `publish:next` only publishes `packages/*`). It replaces the old package of the same name. It peers on `@navios/server`, `@navios/core` and `better-auth`, never on `@navios/di`.

- `provideBetterAuth(options | (ctx) => options, { name? })` returns `InjectionToken<Auth<Options>>`, a factory like `provideJwtService`. Options are passed to `betterAuth()` unchanged.
- `betterAuthPlugin({ auth, path = '/api/auth' })` mounts the routes, provides the `BetterAuth` alias token for the package's own classes, and runs the start-up check.
- `AuthSession`: a request value whose `resolve` calls `auth.api.getSession({ headers })` once per request, lazily, giving `Promise<Session | null>`.
- `requireSession(ctx)` returns `Promise<Session>` and throws `UnauthorizedException` when there is none.
- `BetterAuthGuard` lets a request through when it has a session and throws 401 otherwise. `AllowAnonymous()` (handler, controller or module) skips it. An anonymous route can still read `AuthSession`, so there is no separate "optional auth" attribute.
- Session typing: `declare module '@navios/better-auth' { interface BetterAuthRegister { auth: typeof Auth } }` types `AuthSession` with the application's plugins and additional fields. Without it, the base `{ session, user }` types apply.
- `authForCli(token, { module, providers?, plugins?, logger? })` for the CLI.

## Example

`examples/better-auth-sqlite`: the Bun adapter with `bun:sqlite`. A `Database` service owns the connection, and `Auth` injects it. A notes resource per user is protected by `BetterAuthGuard`. `auth.config.mts` and package scripts (`bun --bun x auth …`) drive the CLI. Its `bun test` suite runs the real CLI (`migrate`, `check`, `generate`) against a temporary database, then the whole sign-up, session, protected route and sign-out flow over HTTP.

## Left to later

- Passing `ctx.ip` to Better Auth (rate limit, session IP) without trusting a client header.
- A docs-site guide. For now the README is the documentation.
- The stale `@navios/better-auth` entry in `@navios/cli`'s config schema, from the old experiment.
