# @navios/microservice

Message handlers for a Navios application: a transport that consumes messages declared with [`@navios/queues`](https://www.npmjs.com/package/@navios/queues) and runs them through the application's modules, guards and interceptors.

**[Documentation](https://navios.tech/docs/server/guides/other-transports)**

## Install

```bash
npm install @navios/microservice@next @navios/core@next @navios/queues@next zod
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

`@navios/core` and `@navios/queues` are peer dependencies. No HTTP package is needed; to serve HTTP from the same process, see below.

## Example

```ts
import { createApplication, Module } from '@navios/core'
import { Message, MessageController, messageTransport } from '@navios/microservice'
import { messageBuilder } from '@navios/queues'
import { z } from 'zod/v4'

import type { MessageParams } from '@navios/microservice'

const messages = messageBuilder()

export const userCreated = messages.declarePubSub({
  topic: 'user.created',
  payloadSchema: z.object({ id: z.string(), email: z.email() }),
})

@MessageController()
class UsersConsumer {
  @Message(userCreated)
  async onCreated({ payload }: MessageParams<typeof userCreated>) {
    // payload is validated: { id: string; email: string }
  }
}

@Module({ messageControllers: [UsersConsumer] })
class AppModule {}

const app = createApplication(AppModule, {
  transports: [messageTransport()],
})

app.enableShutdownHooks()

await app.start()
```

On start the transport subscribes every handler with the queue client: `subscribe` for pub/sub, `receive` for point-to-point and `reply` for request-reply. The client is `QueueClientToken` from the container, or the `client` option. On `close()` the transport waits for the messages in flight. A queue client cannot unsubscribe, so a message the broker delivers after that is left unanswered rather than failed: it stays unacknowledged and is redelivered once the client disconnects. Disconnecting the client is up to whoever created it.

## What a delivery goes through

1. The interceptors of the application.
2. Guards: the module's, the controller's, the handler's. There are no application-level guards. A guard that returns anything but `true` fails the delivery with `MessageDeniedError`.
3. Interceptors: the module's, the controller's, the handler's.
4. The payload is validated against `payloadSchema`; a mismatch fails with `MessageValidationError`.
5. The handler. The return value of a request-reply handler is validated against `responseSchema` and sent back.

Guards and interceptors receive a `MessageContext`: `message` (the declaration), `payload`, `raw`, and what every Navios context has (`id`, `handler`, context keys, `use`, `resolve`, `onFinish`). Type them with `MessageGuard` and `MessageInterceptor`.

## In tests

`dispatch` delivers a message in process, through the same steps:

```ts
await app.init()
await app.transport(messageTransport).dispatch(userCreated, { id: '1', email: 'ada@example.com' })
```

## Together with HTTP

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  transports: [messageTransport()],
})
await app.listen({ port: 3000 })
```

One module can list both `controllers` and `messageControllers`. A guard on such a module runs for requests and for messages; `isMessageContext(ctx)` and `isHttpContext(ctx)` tell them apart.

## Acknowledgement and retries

The transport has no settings for them: they are whatever the queue client does when a handler resolves or rejects.

## License

MIT
