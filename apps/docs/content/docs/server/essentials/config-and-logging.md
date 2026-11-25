---
title: Configuration and logging
---

# Configuration and logging

`@navios/server` ships two small services most applications need from the first day: a typed configuration service and a logger.

## Configuration

`provideConfig` creates an injection token for a `ConfigService` whose content comes from a `load` function. Declare it once and inject it wherever a setting is needed.

```ts title="app.config.mts"
import { envInt, envString, provideConfig } from '@navios/server'
import { z } from 'zod/v4'

export const AppConfig = provideConfig({
  schema: z.object({
    port: z.number(),
    database: z.object({ url: z.string(), poolSize: z.number() }),
  }),
  load: () => ({
    port: envInt('PORT', 3000),
    database: {
      url: envString('DATABASE_URL', 'postgres://localhost/app'),
      poolSize: envInt('DATABASE_POOL', 10),
    },
  }),
})
```

```ts title="database.mts"
import { inject, Injectable } from '@navios/server'

import { AppConfig } from './app.config.mjs'

@Injectable()
export class Database {
  private readonly config = inject(AppConfig)

  connect() {
    const url = this.config.getOrThrow('database.url') // string
    const poolSize = this.config.getOrDefault('database.poolSize', 10) // number
    // ...
  }
}
```

- `load` may be asynchronous. It runs once, the first time the token is resolved.
- `schema` is optional. With it, the loaded value is validated and the service is typed from the schema's output. It can be any Standard Schema and must validate synchronously. Without it, the service is typed from the return type of `load`.
- Keys are dot-separated paths and are type-checked: `'database.url'` compiles, `'database.uri'` does not.

### Reading values

| Method                            | Result                                        |
| --------------------------------- | --------------------------------------------- |
| `get(key)`                        | The value, or `null` when it is missing       |
| `getOrDefault(key, defaultValue)` | The value, or the default when it is missing  |
| `getOrThrow(key, message?)`       | The value. Logs and throws when it is missing |
| `getConfig()`                     | The whole configuration object                |

### Environment variables

`envString(key, default?)` and `envInt(key, default)` read single variables, as in `load` above.

`EnvConfigProvider` is a ready-made token for a `ConfigService` over a snapshot of `process.env`, taken when `@navios/server` is imported. It suits a small application that does not need a schema:

```ts
import { EnvConfigProvider, inject, Injectable } from '@navios/server'

@Injectable()
export class Mailer {
  private readonly env = inject(EnvConfigProvider)
}
```

### Configuration in tests

A config token is an ordinary injection token, so a test replaces it with a provider. See [Replacing dependencies](/docs/server/essentials/testing#replacing-dependencies).

## Logging

Inject a `Logger` with a context name. The name appears with every message the instance writes.

```ts
import { inject, Injectable, Logger } from '@navios/server'

@Injectable()
export class SignupService {
  private readonly logger = inject(Logger, { context: 'SignupService' })

  async signUp(input: { name: string; email: string }) {
    this.logger.log(`Signing up ${input.email}`)
    // ...
  }
}
```

The methods are `log`, `error`, `warn`, `debug`, `verbose` and `fatal`.

### Choosing the output

Where the output goes is decided by the application's `logger` option.

| `logger` value                           | Result                                                    |
| ---------------------------------------- | --------------------------------------------------------- |
| omitted                                  | The console logger, all levels                            |
| `['error', 'warn', 'log']`               | The console logger with the listed levels                 |
| `false`                                  | No output                                                 |
| `ConsoleLogger.create({ json: true })`   | The console logger with other options, here JSON lines    |
| an object implementing `LoggerService`   | Your own logger                                           |

```ts
import { ConsoleLogger, NaviosFactory } from '@navios/server'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: process.env.NODE_ENV === 'production' ? ConsoleLogger.create({ json: true }) : undefined,
})
```

The levels are `verbose`, `debug`, `log`, `warn`, `error` and `fatal`.

### A custom logger

A `LoggerService` is any object with `log`, `error` and `warn` methods; `debug`, `verbose` and `fatal` are optional. This is the place to connect pino, winston or a hosted log service.

```ts
import type { LoggerService } from '@navios/server'

const jsonLines: LoggerService = {
  log: (message, ...rest) => console.log(JSON.stringify({ level: 'info', message, rest })),
  warn: (message, ...rest) => console.warn(JSON.stringify({ level: 'warn', message, rest })),
  error: (message, ...rest) => console.error(JSON.stringify({ level: 'error', message, rest })),
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: jsonLines,
})
```

Every `Logger` injected anywhere in the application writes to this object, with the context name appended as the last argument: `logger.log('hello')` from the service above calls `jsonLines.log('hello', 'SignupService')`. Navios's own messages, such as the log entry for an unexpected error, go to it too.

### Request ids

The console logger prints the id of the request being handled with each message when the application was created with [`asyncContext: true`](/docs/server/essentials/request-context#reading-the-context-without-passing-it). The id is `ctx.id`. A console logger you create yourself with `ConsoleLogger.create` needs its own `requestId: true` option as well.
