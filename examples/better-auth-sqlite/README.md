# Better Auth with SQLite

A notes API with [Better Auth](https://www.better-auth.com) email and password sign-in, on Bun with `bun:sqlite`. It shows [`@navios/better-auth`](../../lab-packages/better-auth):

- `src/auth.mts`: Better Auth is built by the DI container. Its factory injects the configuration and the `Database` service, so the application and Better Auth share one SQLite connection.
- `src/create-app.mts`: `betterAuthPlugin` serves Better Auth at `/api/auth`. On Bun, Better Auth gets the request Bun received, and its response is sent as it is.
- `src/app.module.mts`: `BetterAuthGuard` protects every route of the module. Handlers read the user with `requireSession(ctx)`.
- `auth.config.mts`: the Better Auth CLI gets the same instance, built from the same module, with `authForCli`.

## Run it

```bash
cp .env.example .env   # and set BETTER_AUTH_SECRET
yarn auth:migrate      # creates Better Auth's tables in ./data/app.db
yarn start
```

Then:

```bash
curl -i -X POST localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' \
  -H 'origin: http://localhost:3000' -c cookies.txt \
  -d '{"email":"ada@example.com","password":"correct horse battery","name":"Ada"}'
curl -b cookies.txt localhost:3000/me
curl -b cookies.txt -X POST localhost:3000/notes -H 'content-type: application/json' -d '{"text":"Hello"}'
curl -b cookies.txt localhost:3000/notes
```

## The Better Auth CLI

| Script               | Runs                                                   |
| -------------------- | ------------------------------------------------------ |
| `yarn auth:migrate`  | `auth migrate`: creates or alters the tables           |
| `yarn auth:generate` | `auth generate`: writes the SQL instead of applying it |
| `yarn auth:check`    | `auth check`: compares the schema with the database    |

The scripts run the CLI on Bun: `bun --bun x auth …`. The CLI loads its config with a native `import()` first, and on Bun that loads the application, standard decorators included. `--bun` is needed because the `auth` bin would otherwise start Node, which cannot load this application. Add `--yes` to skip the confirmation.

## Tests

`yarn test:ci` runs `bun test`: `e2e/cli.spec.mts` runs the real CLI against a temporary database, and `e2e/auth-flow.spec.mts` the sign-up, notes, sign-in and sign-out flow over HTTP.
