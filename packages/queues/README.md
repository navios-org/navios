# @navios/queues

Message queue clients for Navios with zod-validated messages. One `QueueClient` interface covers RabbitMQ, Kafka and AWS SQS/SNS, and three small services (`QueuePublisher`, `QueueSender`, `QueueRequester`) send typed messages through it.

The package depends only on `@navios/di`, so it works with or without `@navios/server`.

## Installation

```bash
npm install @navios/queues@next @navios/di@next zod
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

Install the driver of the broker you use; the others are not loaded:

| Broker      | Packages                                     |
| ----------- | -------------------------------------------- |
| RabbitMQ    | `amqp-connection-manager`, `amqplib`         |
| Kafka       | `kafkajs`                                    |
| AWS SQS/SNS | `@aws-sdk/client-sqs`, `@aws-sdk/client-sns` |

## Configuration

Queue clients read their configuration from the service bound to `QueueConfigServiceToken`. The package registers a default provider for that token, `DefaultQueueConfigService`, whose only job is to fail with a clear message. Replace it with your own:

```ts
import type { QueueConfig, QueueConfigService } from '@navios/queues'

export class AppQueueConfig implements QueueConfigService {
  getConfig(): QueueConfig {
    return {
      default: {
        type: 'rabbitmq',
        url: process.env.AMQP_URL!,
        vhost: '/',
        heartbeatIntervalInSeconds: 5,
        prefetch: 10,
      },
      audit: {
        type: 'kafka',
        brokers: ['localhost:9092'],
        connectionTimeout: 30000,
        requestTimeout: 30000,
      },
    }
  }
}
```

The class may use `inject()` to read from your own configuration service. Bind it with `provide()` in whichever place fits:

```ts
import { QueueConfigServiceToken } from '@navios/queues'
import { NaviosFactory, provide } from '@navios/server'

// in a module
@Module({ providers: [provide(QueueConfigServiceToken, AppQueueConfig)] })
class AppModule {}

// or for the whole application
const app = await NaviosFactory.create(AppModule, {
  adapter,
  providers: [provide(QueueConfigServiceToken, AppQueueConfig)],
})

// or on a bare container, before the first queue client is resolved
const container = new Container()
container.provide(QueueConfigServiceToken, AppQueueConfig)
```

In `@navios/queues` 0.x the default was registered with `priority: -1000` and replaced by a second `@Injectable({ token: QueueConfigServiceToken })`. Priorities no longer exist in `@navios/di` 2.0, and a second class declaring the same token throws `ProviderConflict`; use `provide()` as shown.

`queueConfigSchema` and the per-broker schemas (`rabbitmqConfigSchema`, `kafkaConfigSchema`, `sqsConfigSchema`) are exported if you want to validate configuration that comes from the environment.

## Queue clients

`QueueClientToken` resolves a connected `QueueClient`. Its optional argument names an entry of the configuration; without it the `default` entry is used.

```ts
import { inject, Injectable } from '@navios/di'
import { QueueClientToken } from '@navios/queues'

@Injectable()
class AuditLog {
  private readonly queue = inject(QueueClientToken, { name: 'audit' })

  async record(event: unknown) {
    await this.queue.publish('audit.events', event)
  }
}
```

- There is one client per name per container. `inject(QueueClientToken)` and `inject(QueueClientToken, { name: 'default' })` give the same client.
- The client connects when it is first resolved. Connecting is asynchronous, so a class that injects a client is resolved with `await container.get(...)` (inside a Navios application this is already the case).
- The client disconnects when the container is disposed, which `app.close()` does, or when it is invalidated with `container.invalidate(client)`.
- A name that is not in the configuration rejects with `Queue <name> not found in config`.

`QueueClient` has `publish`/`subscribe` (pub/sub), `send`/`receive` (point-to-point), `request`/`reply` (request/reply) and `disconnect`.

To use your own client, for example an in-memory one in tests, replace the provider:

```ts
new Container({ providers: [provide(QueueClientToken, { value: fakeClient })] })
```

## Typed messages

Declare a message once, with its zod schemas:

```ts
import { messageBuilder } from '@navios/queues'
import { z } from 'zod/v4'

const messages = messageBuilder()

export const userCreated = messages.declarePubSub({
  topic: 'user.created',
  payloadSchema: z.object({ id: z.string(), email: z.string() }),
})

export const sendEmail = messages.declarePointToPoint({
  queue: 'emails',
  payloadSchema: z.object({ to: z.string(), subject: z.string() }),
})

export const getUser = messages.declareRequestReply({
  topic: 'user.get',
  payloadSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ id: z.string(), name: z.string() }),
})
```

Then bind a publisher, sender or requester to the declaration. `InjectionToken.refineType` carries the payload type to the place of use:

```ts
import { inject, Injectable, InjectionToken } from '@navios/di'
import { QueuePublisherToken } from '@navios/queues'

import type { QueuePublisher } from '@navios/queues'

export const UserCreatedPublisher = InjectionToken.refineType<QueuePublisher<typeof userCreated>>(
  InjectionToken.bound(QueuePublisherToken, { messageDef: userCreated }),
)

@Injectable()
class UserService {
  private readonly userCreated = inject(UserCreatedPublisher)

  async create(email: string) {
    // the payload is type-checked, and validated with the schema before it is sent
    await this.userCreated.publish({ id: crypto.randomUUID(), email })
  }
}
```

| Token                 | Argument                                       | Service                                                                                      |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `QueuePublisherToken` | `{ messageDef, name? }`, a pub/sub declaration | `QueuePublisher#publish(payload)`                                                            |
| `QueueSenderToken`    | `{ messageDef, name? }`, a point-to-point one  | `QueueSender#send(payload)`                                                                  |
| `QueueRequesterToken` | `{ messageDef, name? }`, a request/reply one   | `QueueRequester#request(payload)`, which resolves to the response parsed by `responseSchema` |

`name` selects the queue client and defaults to `'default'`. A declaration of the wrong pattern is rejected when the service is resolved, with a `DIError` whose code is `TokenValidationError`.

## Limitations

- Message schemas must be zod schemas (`zod/v4`).
- Consuming (`subscribe`, `receive`, `reply`) is available on `QueueClient` only; there are no typed consumer services or decorators yet.

## License

MIT
