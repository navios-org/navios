---
title: WebSocket
---

# WebSocket

`@navios/builder/socket` gives messages the same treatment `declareEndpoint` gives HTTP calls: you declare a topic and its schemas once, and get a typed function that validates what it sends and what it receives. It works with Socket.IO and with the browser's native `WebSocket`.

## WebSocket or SSE?

|                 | WebSocket                               | Server-Sent Events                                 |
| --------------- | --------------------------------------- | -------------------------------------------------- |
| Direction       | Both ways                               | Server to client only                              |
| Entry point     | `@navios/builder/socket`                | `@navios/builder/eventsource`                      |
| Transport       | WebSocket protocol, or Socket.IO        | Plain HTTP, reconnects on its own                  |
| Reach for it to | send messages and wait for replies      | follow a feed: notifications, progress, live lists |

If the client only listens, [Server-Sent Events](/docs/builder/realtime/server-sent-events) is the smaller tool. If it also talks, use a socket.

## Create a socket builder

A socket builder holds the connection and hands out send and subscribe functions. It is separate from the HTTP builder and has its own client.

```ts title="socket.ts"
import { socketBuilder } from '@navios/builder/socket'
import { io } from 'socket.io-client'

export const socket = socketBuilder()

socket.provideClient(io('wss://api.example.com'))
```

`provideClient` accepts anything with `emit`, `on` and `off`: a Socket.IO client, or a handle from [`declareWebSocket`](#native-websocket). Sending or subscribing before a client is provided throws a `NaviosError`.

## Send messages

`defineSend` returns a function for one topic. The payload is validated first, and the schema's output is what goes on the wire.

```ts
import { z } from 'zod/v4'

import { socket } from './socket'

export const sendTyping = socket.defineSend({
  topic: 'user.typing',
  payloadSchema: z.object({ userId: z.string() }),
})

sendTyping({ userId: '42' }) // returns nothing
```

An invalid payload throws a `SocketError` and nothing is sent.

### Wait for an acknowledgement

Add an `ackSchema` and the function returns a promise that resolves with the server's validated reply.

```ts
// userSchema from the Quick start
export const renameUser = socket.defineSend({
  topic: 'user.rename',
  payloadSchema: z.object({ userId: z.string(), name: z.string() }),
  ackSchema: userSchema,
  ackTimeout: 5000,
})

const user = await renameUser({ userId: '42', name: 'Ada' })
//    ^? { id: string; name: string; email: string }
```

The promise rejects with a `SocketError` when the reply fails `ackSchema` or does not arrive within `ackTimeout`. The timeout defaults to 30 seconds; set it per topic as above, or for every topic with `socketBuilder({ ackTimeout })`.

## Subscribe to messages

`defineSubscribe` returns a function that registers a listener and gives back an unsubscribe function.

```ts
export const onUserUpdated = socket.defineSubscribe({
  topic: 'user.updated',
  payloadSchema: userSchema,
})

const unsubscribe = onUserUpdated((user) => {
  console.log(user.name)
})

unsubscribe()
```

A message that fails `payloadSchema` is skipped and reported to [`onError`](#the-onerror-hook); your listener only ever sees valid data. A listener that throws does not stop the other listeners of the topic.

Both kinds of function keep their declaration on `.config`, like an endpoint does.

## Native WebSocket

`declareWebSocket` describes a connection the way `declareEndpoint` describes a request: a URL template, optional `urlParamsSchema` and `querySchema`, and optional sub-protocols. Calling the result opens the socket and returns a handle you can give to the builder.

```ts
import { declareWebSocket } from '@navios/builder/socket'

const usersSocket = declareWebSocket({
  url: 'wss://api.example.com/ws/teams/$teamId',
  querySchema: z.object({ token: z.string() }),
  protocols: ['v1.users'],
})

const handle = usersSocket({
  urlParams: { teamId: '7' },
  params: { token: 'secret' },
})

socket.provideClient(handle)
```

The handle follows Socket.IO's shape, so it also works on its own:

```ts
handle.on('connect', () => console.log('open'))
handle.on('disconnect', (reason) => console.log('closed', reason))
handle.on('user.updated', (payload) => console.log(payload))
handle.emit('user.typing', { userId: '42' })
handle.close()
```

It also exposes `url`, `connected`, `state` (`'connecting' | 'open' | 'closing' | 'closed'`) and the underlying `socket`.

:::warning
`open`, `close`, `error`, `message`, `connect`, `disconnect` and `connect_error` are connection events on a handle. `handle.on('close', ...)` never fires for a server message whose topic is `close`. To listen to a topic with one of those names, use `handle.onTopic(topic, listener)` or `socket.defineSubscribe({ topic })`.
:::

When several connections share a host, `createWebSocketHandler({ baseUrl, onError })` returns a `declareWebSocket` with the base URL applied.

`urlParamsSchema` and `querySchema` must validate synchronously, because the connection opens synchronously.

## Wire format

By default every message is a JSON array:

| Message          | Frame                                   |
| ---------------- | --------------------------------------- |
| Send             | `[topic, payload]`                      |
| Send with ack    | `[topic, payload, ackId]`               |
| Incoming message | `[topic, payload]`                      |
| Acknowledgement  | `['__navios_ack:<ackId>', response]`    |

How a frame travels depends on the client:

- **A `declareWebSocket` handle** sends each frame as one JSON text message and reads incoming frames the same way.
- **A Socket.IO client** receives the frame as the argument of an event: outgoing as `emit(topic, frame)`, incoming on the `message` event, and acknowledgements on the `__navios_ack:<ackId>` event. Your server has to emit accordingly.

To talk to a backend with a different envelope, replace both directions:

```ts
const socket = socketBuilder({
  formatMessage: (topic, payload, ackId) => ({
    type: topic,
    data: payload,
    ...(ackId && { requestId: ackId }),
  }),
  parseMessage: (message) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return null
    const { type, data, requestId } = message as { type: string; data: unknown; requestId?: string }
    return { topic: type, payload: data, ackId: requestId }
  },
})
```

When `parseMessage` returns an `ackId` that a send is still waiting for, the message settles that send and is not delivered to subscribers. That is how acknowledgements work in a custom format.

## Errors

Every failure is a `SocketError`. Send functions throw it or reject with it; failures on the receiving side have no caller, so they only reach `onError`.

| `kind`        | When                                                               | What happens                                  |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `validation`  | `payloadSchema` rejects the payload you pass to a send function    | The call throws; nothing is sent              |
| `validation`  | `payloadSchema` rejects an incoming message                        | The message is skipped                        |
| `validation`  | `ackSchema` rejects an acknowledgement                             | The send promise rejects                      |
| `ack-timeout` | No acknowledgement arrived within `ackTimeout`                     | The send promise rejects                      |
| `transport`   | A subscriber threw                                                 | The other subscribers still run               |
| `transport`   | `formatMessage` or the client threw while sending                  | The call throws, or the send promise rejects  |
| `transport`   | `provideClient` replaced the client while a send awaited its reply | The send promise rejects                      |

A `SocketError` carries `kind`, `topic`, `message`, and where they apply `url` (the connection URL, when the client has one), `issues`, `rawData` (the value that failed validation) and `cause` (the schema library's own error, or whatever was thrown). `toJSON()` returns the same fields without `cause`.

```ts
import { isSocketError } from '@navios/builder/socket'

try {
  await renameUser({ userId: '42', name: 'Ada' })
} catch (error) {
  if (isSocketError(error) && error.kind === 'ack-timeout') {
    console.warn('The server did not answer')
  } else {
    throw error
  }
}
```

One asynchronous-schema rule follows from the return types: a send without `ackSchema` returns nothing, so it cannot wait for a `payloadSchema` that validates asynchronously and throws a `validation` error instead. Everywhere else asynchronous schemas are awaited.

### The onError hook

`socketBuilder({ onError })` is called once for every row in the table above, with the same instance a send function throws.

```ts
const socket = socketBuilder({
  onError: (error) => {
    console.error(`[socket] ${error.kind} on ${error.topic}: ${error.message}`)
  },
})
```

The hook is for telemetry. An exception thrown inside it is caught and logged, and never changes how a message is handled. `createWebSocketHandler({ onError })` has the same contract for the handle itself: a listener registered with `handle.on()` that throws, or a failed send on the underlying `WebSocket`, is reported as kind `transport`.

Related: [Realtime updates](/docs/builder/react-query/recipes/realtime-updates) pushes these messages into the React Query cache, and the [API reference](/docs/builder/reference/builder) lists every export of this entry point.
