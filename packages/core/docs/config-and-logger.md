# Config and logger

## Config

`provideConfig` creates an injection token for a `ConfigService` whose content comes from a `load` function.

```ts
import { envInt, envString, inject, Injectable, provideConfig } from '@navios/core'
import { z } from 'zod'

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

@Injectable()
export class Database {
  private readonly config = inject(AppConfig)

  connect() {
    const url = this.config.getOrThrow('database.url') // string
    const pool = this.config.getOrDefault('database.poolSize', 10) // number
  }
}
```

- `load` may be asynchronous. It runs once, the first time the token is resolved.
- `schema` is optional. With it, the loaded value is validated and the service is typed from the schema's output. The schema can be any Standard Schema and must validate synchronously. Without it, the service is typed from the return type of `load`.
- Keys are dot-separated paths and are type-checked.

| Method                            | Result                                         |
| --------------------------------- | ---------------------------------------------- |
| `get(key)`                        | The value, or `null` when it is missing.       |
| `getOrDefault(key, defaultValue)` | The value, or the default when it is missing.  |
| `getOrThrow(key, message?)`       | The value. Logs and throws when it is missing. |
| `getConfig()`                     | The whole configuration object.                |

`EnvConfigProvider` is a ready-made token for a `ConfigService` over a snapshot of `process.env` taken when `@navios/core` is imported. `envInt(key, default)` and `envString(key, default?)` read single variables.

## Logger

Inject a logger with a context name:

```ts
import { inject, Injectable, Logger } from '@navios/core'

@Injectable()
export class UsersService {
  private readonly logger = inject(Logger, { context: 'UsersService' })

  create(name: string) {
    this.logger.log(`Creating user ${name}`)
  }
}
```

The methods are `log`, `error`, `warn`, `debug`, `verbose` and `fatal`.

Where the output goes is decided by the application's `logger` option:

```ts
// Default: the console logger, all levels
NaviosFactory.create(AppModule, { adapter })

// The console logger with selected levels
NaviosFactory.create(AppModule, { adapter, logger: ['error', 'warn', 'log'] })

// No output
NaviosFactory.create(AppModule, { adapter, logger: false })

// Your own logger: any object with log, error and warn (debug, verbose, fatal optional)
NaviosFactory.create(AppModule, { adapter, logger: pinoAdapter })

// The console logger with other options
NaviosFactory.create(AppModule, { adapter, logger: ConsoleLogger.create({ json: true }) })
```

The object given as `logger` implements `LoggerService`. Every `Logger` injected anywhere in the application writes to it, with the context name appended as the last argument.

The console logger prints the request id with each message when both the application's `asyncContext` option is on and the logger's `requestId` option is on. With the default console logger, `asyncContext: true` is enough. The id is `ctx.id` of the request being handled.
