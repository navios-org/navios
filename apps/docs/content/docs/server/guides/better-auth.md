---
title: Better Auth
---

# Authentication with Better Auth

[Better Auth](https://www.better-auth.com) takes care of accounts: sign-up and sign-in, sessions, social providers, two-factor, organizations, and the database tables behind them. `@navios/better-auth` connects it to your application. You configure Better Auth like any other service, and protect your routes with decorators.

:::warning Experimental
`@navios/better-auth` is not published yet. A complete application is in [`examples/better-auth-sqlite`](https://github.com/navios-org/navios/tree/main/examples/better-auth-sqlite).
:::

## Set up

### 1. Install

```bash
bun add @navios/better-auth better-auth
bun add -d auth
```

`auth` is Better Auth's command-line tool, used in step 4. Set `BETTER_AUTH_SECRET` (at least 32 characters; `bun --bun x auth secret` makes one) and `BETTER_AUTH_URL` (where the application is reached, such as `http://localhost:3000`) in `.env`.

### 2. Configure Better Auth

Create the instance with `provideBetterAuth`. The options are [Better Auth's own](https://www.better-auth.com/docs/reference/options); write them as a function to use your services, such as the one that holds the database connection:

```ts title="src/auth.mts"
import { provideBetterAuth } from '@navios/better-auth'

import { Database } from './database.mjs'

export const Auth = provideBetterAuth(async (ctx) => {
  const db = await ctx.inject(Database)
  return {
    database: db.connection,
    emailAndPassword: { enabled: true },
  }
})
```

Better Auth works with SQLite, PostgreSQL, MySQL, Prisma, Drizzle and more; see its [database guide](https://www.better-auth.com/docs/concepts/database).

### 3. Add the plugin

```ts title="src/main.mts"
import { betterAuthPlugin } from '@navios/better-auth'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
  plugins: [betterAuthPlugin({ auth: Auth })],
})
```

Better Auth's endpoints are now served under `/api/auth`: sign-up, sign-in, sign-out, the current session and everything its plugins add.

### 4. Create the tables

Better Auth's CLI creates its tables. Point it at your application with a small config file:

```ts title="auth.config.mts"
import { authForCli } from '@navios/better-auth'

import { AppModule } from './src/app.module.mjs'
import { Auth } from './src/auth.mjs'

export default authForCli(Auth, { module: AppModule })
```

```json title="package.json"
{
  "scripts": {
    "auth:migrate": "bun --bun x auth migrate --config auth.config.mts"
  }
}
```

Run `bun run auth:migrate`, and again whenever you change Better Auth's options or add one of its plugins.

## Protect routes

Say what a route needs with a decorator on the handler, the controller or the module:

| Decorator          | Not signed in | Signed in                        |
| ------------------ | ------------- | -------------------------------- |
| `@Authenticated()` | 401           | allowed                          |
| `@Roles('admin')`  | 401           | allowed with that role, else 403 |
| `@Guest()`         | allowed       | 403                              |
| `@OptionalAuth()`  | allowed       | allowed                          |
| `@Public()`        | allowed       | allowed                          |

A route without a decorator is not checked. The most specific decorator counts, so a controller can be `@Authenticated()` while one of its handlers is `@Public()`:

```ts title="src/notes/notes.controller.mts"
import { Authenticated, CurrentUser, Public, Roles } from '@navios/better-auth'

@Authenticated()
@Controller()
export class NotesController {
  private readonly notes = inject(NotesService)

  @Endpoint(listNotes)
  list(_params: HandlerParams<typeof listNotes>, ctx: RequestContext) {
    return this.notes.listFor(ctx.get(CurrentUser).id)
  }

  @Public()
  @Endpoint(listFeatured)
  featured() {
    return this.notes.featured()
  }

  @Roles('admin')
  @Endpoint(deleteNote)
  remove({ urlParams }: HandlerParams<typeof deleteNote>) {
    return this.notes.remove(urlParams.id)
  }
}
```

### The current user

Behind `@Authenticated()` and `@Roles()`, `ctx.get(CurrentUser)` is the signed-in user, and `ctx.get(CurrentSession)` their session. Both are ready when the handler runs: no lookup, no `await`. On an `@OptionalAuth()` route, use `ctx.find(CurrentUser)`, which is `undefined` for a visitor.

### Guests and roles

`@Guest()` is for your own pages that only make sense signed out, such as an invitation form. Better Auth's sign-up and sign-in are already served by the plugin.

`@Roles()` checks `user.role`. Add Better Auth's [admin plugin](https://www.better-auth.com/docs/plugins/admin) to give users roles, then run `auth:migrate`. Any one of the listed roles is enough: `@Roles('editor', 'admin')`.

## Type your user

`CurrentUser` has Better Auth's standard fields. To see the fields your options add, such as `role` from the admin plugin or your own `additionalFields`, register your instance once:

```ts title="src/auth.mts"
declare module '@navios/better-auth' {
  interface BetterAuthRegister {
    auth: typeof Auth
  }
}
```

## Sign users in from your front end

Your front end talks to Better Auth with its client:

```ts
import { createAuthClient } from 'better-auth/client'

const authClient = createAuthClient({ baseURL: 'http://localhost:3000' })

await authClient.signUp.email({ email, password, name })
await authClient.signIn.email({ email, password })
await authClient.signOut()
```

The session is kept in a cookie, which the browser sends with every request to your API. When the front end runs on another origin, allow it in two places: CORS with credentials on the adapter, such as `defineBunEnvironment({ cors: { origin: 'https://app.example.com', credentials: true } })`, and `trustedOrigins: ['https://app.example.com']` in Better Auth's options.

## Test

Run Better Auth's migrations in the test, sign up, and send the cookie along:

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
  body: { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' },
})
const cookie = signUp.cookies.map((value) => value.split(';')[0]).join('; ')

const notes = await app.inject({ method: 'GET', url: '/notes', headers: { cookie } })
```

Use an in-memory database for tests, such as SQLite's `:memory:`. See [Testing](/docs/server/essentials/testing) for the rest of the setup.

## Good to know

- **Global prefix.** With `globalPrefix: '/v1'` Better Auth's endpoints move to `/v1/api/auth`; set `basePath: '/v1/api/auth'` in its options. The application tells you at start-up when the two disagree.
- **Node.js.** On Node, run the CLI with a TypeScript loader: `NODE_OPTIONS='--import tsx/esm' auth migrate --config auth.config.mts`.
- **Calling Better Auth from a service.** Inject `Auth` and use its server API, passing the request's headers: `this.auth.api.listSessions({ headers: ctx.headers.toWebHeaders() })`.

## Reference

| Export                                                                        | What it is                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `provideBetterAuth(options)`                                                  | Creates the Better Auth instance, injectable as the token it returns  |
| `betterAuthPlugin({ auth, path? })`                                           | Serves Better Auth's endpoints at `path`, `/api/auth` by default      |
| `authForCli(auth, { module })`                                                | The instance for Better Auth's CLI                                    |
| `@Authenticated()`, `@Roles(...)`, `@Guest()`, `@OptionalAuth()`, `@Public()` | Access decorators                                                     |
| `CurrentUser`, `CurrentSession`                                               | The signed-in user and session, read with `ctx.get()` or `ctx.find()` |
| `BetterAuthGuard`                                                             | The guard behind the decorators, for `guards: [...]`                  |
| `BetterAuthRegister`, `SessionOf<T>`                                          | Typing of the user and session                                        |
