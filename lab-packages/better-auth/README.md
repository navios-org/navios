# @navios/better-auth

[Better Auth](https://www.better-auth.com) in a [Navios](https://navios.tech) application. The auth instance is built by the DI container, so its options can use your services. The package serves Better Auth's routes, gives handlers the session of the request, and keeps Better Auth's CLI working.

> **Experiment.** The package lives in `lab-packages/` and is not published. [`examples/better-auth-sqlite`](../../examples/better-auth-sqlite) is a complete application.

`@navios/server`, `@navios/core` and `better-auth` (1.7 or later) are peer dependencies.

## Configure

`provideBetterAuth` returns an injection token with a Better Auth instance behind it. The options go to `betterAuth()` unchanged. Pass a function when they need other services. It receives a factory context and runs once per container:

```ts title="auth.mts"
import { provideBetterAuth } from '@navios/better-auth'

export const Auth = provideBetterAuth(async (ctx) => {
  const config = await ctx.inject(AppConfig)
  const db = await ctx.inject(Database)
  return {
    baseURL: config.getOrThrow('auth.baseURL'),
    secret: config.getOrThrow('auth.secret'),
    database: db.connection, // a node:sqlite DatabaseSync, a pg Pool, a Kysely dialect, an adapter…
    emailAndPassword: { enabled: true },
  }
})
```

Inject the token wherever you call Better Auth's server API:

```ts
@Injectable()
class AccountService {
  private readonly auth = inject(Auth)

  listSessions(ctx: RequestContext) {
    return this.auth.api.listSessions({ headers: ctx.headers.toWebHeaders() })
  }
}
```

## Serve the routes

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
  plugins: [betterAuthPlugin({ auth: Auth })],
})
```

| Option | Default       | Meaning                                                |
| ------ | ------------- | ------------------------------------------------------ |
| `auth` |               | The token of `provideBetterAuth`                       |
| `path` | `'/api/auth'` | Where the routes are, below the application's prefixes |

The plugin declares one route per method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`; `HEAD` is answered as `GET`) on `path/$path*`, a rest param that takes the rest of the path, and hands each request to `auth.handler()` with `ctx.toWebRequest()`. On Bun and srvx that is the request the server received, untouched; on Fastify one built from it. Better Auth's `Response` is returned as it is: status, headers, every `set-cookie` and its body. Every endpoint of Better Auth and of its plugins is reached, whatever its method or depth.

They are ordinary routes, so they pass through the application's interceptors (CORS, OpenTelemetry) and get its global prefix. A cookie an interceptor sets on such a route is sent next to Better Auth's own. A route of your own with a fixed path under `path`, such as `/api/auth/me`, wins over them. They are public and left out of an OpenAPI document.

The instance is created when the application starts. When `path`, with the application's prefixes, is not Better Auth's base path, the start fails with a message that says what to change: with `globalPrefix: '/v1'` the routes are at `/v1/api/auth`, and Better Auth needs `basePath: '/v1/api/auth'`, or a `baseURL` with that path.

## Protect routes

A route says what it needs of the session with a decorator, on the handler, the controller or the module. The most specific one counts, and a route without one is not checked:

| Decorator          | Without a session | Signed in                 | In the handler          |
| ------------------ | ----------------- | ------------------------- | ----------------------- |
| none               | no check          | no check                  |                         |
| `@Public()`        | passes            | passes                    |                         |
| `@Authenticated()` | 401               | passes                    | `ctx.get(CurrentUser)`  |
| `@Roles('admin')`  | 401               | 403 unless a role matches | `ctx.get(CurrentUser)`  |
| `@Guest()`         | passes            | 403                       |                         |
| `@OptionalAuth()`  | passes            | passes                    | `ctx.find(CurrentUser)` |

```ts
@Authenticated()
@Controller()
export class NotesController {
  @Endpoint(listNotes)
  list(_params: HandlerParams<typeof listNotes>, ctx: RequestContext) {
    return this.notes.list(ctx.get(CurrentUser).id)
  }

  @Public()
  @Endpoint(listFeatured)
  featured() {
    return this.notes.featured()
  }

  @Roles('admin')
  @Endpoint(purgeNotes)
  purge() {
    return this.notes.purge()
  }
}
```

- Each decorator but `@Public()` attaches `BetterAuthGuard`, which runs once per request, looks the session up once, and fills `CurrentUser` and `CurrentSession` before the handler. They are read synchronously; behind `@Authenticated()` and `@Roles()` they are always there.
- `@Public()` exempts a route from a decorator above it, and does no lookup.
- `@Roles()` reads `user.role`, a comma-separated list as Better Auth's [admin plugin](https://www.better-auth.com/docs/plugins/admin) keeps it. Any one of the roles is enough.
- `@Guest()` is for the application's own routes for visitors, such as an invitation form. Better Auth's sign-up and sign-in are served by the plugin, which leaves them open.
- When Better Auth extends a session, its new cookie is sent with the response.
- `BetterAuthGuard` can also be given to a module or to the application (`guards: [BetterAuthGuard]`). It acts on the decorators only.

The user and the session are typed with Better Auth's base fields. Register your token to type them with your plugins and additional fields:

```ts
declare module '@navios/better-auth' {
  interface BetterAuthRegister {
    auth: typeof Auth
  }
}
```

`SessionOf<typeof Auth>` is the same type, for a token or an instance, without registering.

## The Better Auth CLI

Better Auth's CLI (the `auth` package: `auth migrate`, `generate`, `check`, `create-admin`, `info`) reads an `auth` instance from a config file. `authForCli` builds the application without transports and resolves the instance from it, so the CLI sees exactly the instance the application uses:

```ts title="auth.config.mts"
import { authForCli } from '@navios/better-auth'

import { AppModule } from './src/app.module.mjs'
import { Auth } from './src/auth.mjs'

export default authForCli(Auth, { module: AppModule })
```

The CLI has to run where the application's decorators load. It imports the config natively first and only falls back to its own loader when that fails, and that loader compiles decorators in the legacy form. Bun loads them itself:

| Command                                                                 | Result                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `bun --bun x auth migrate --config auth.config.mts`                     | Works                                                  |
| `npx auth migrate --config auth.config.mts`                             | Fails: `@Injectable was applied as a legacy decorator` |
| `NODE_OPTIONS='--import tsx/esm' auth migrate --config auth.config.mts` | Works, for an application that runs on Node            |

So no wrapper is needed. Put the commands in scripts:

```json
{
  "scripts": {
    "auth:migrate": "bun --bun x auth migrate --config auth.config.mts",
    "auth:generate": "bun --bun x auth generate --config auth.config.mts"
  }
}
```

`--bun` matters: without it, the `auth` bin starts Node from its shebang. Bun loads `.env`, and so does the CLI before the config, so configuration from the environment works.

`authForCli` takes `providers`, which win over those of modules, for example a database for migrations; `plugins`, for what they provide (not `betterAuthPlugin`: there is no HTTP transport); and `logger`, which is off by default.

A project that can run the CLI neither on Bun nor with a loader can keep a config without decorators: build the options in a function of plain values, and call it from both the `provideBetterAuth` factory and an `auth.ts` that exports `betterAuth(options(...))`. The dependencies are then wired twice.

## Testing

Run Better Auth's migrations on the instance the application built, then call the routes:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
  plugins: [betterAuthPlugin({ auth: Auth })],
})
await app.init()
await (await (await app.get(Auth)).$context).runMigrations()

const signUp = await app.inject({
  method: 'POST',
  url: '/api/auth/sign-up/email',
  headers: { origin: 'http://localhost:3000' },
  body: { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' },
})
```

`signUp.cookies` holds the session cookie for the next call.

## Limits

- Better Auth reads the client's address from proxy headers (`advanced.ipAddress`) for rate limiting and session records, as on any framework. The address of the connection, `ctx.ip`, is not passed on.
