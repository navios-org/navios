# Socket Builder

A declarative, type-safe WebSocket/Socket.IO messaging builder for `@navios/builder`.

## Installation

The socket builder is available as a separate export from `@navios/builder`:

```typescript
import { socketBuilder, declareWebSocket } from '@navios/builder/socket'
```

## Quick Start

```typescript
import { socketBuilder } from '@navios/builder/socket'
import { io } from 'socket.io-client'
import { z } from 'zod'

// 1. Create builder
const socket = socketBuilder()

// 2. Provide Socket.IO client
socket.provideClient(io('ws://localhost:3000'))

// 3. Define typed send/subscribe handlers
const sendMessage = socket.defineSend({
  topic: 'chat.message',
  payloadSchema: z.object({ text: z.string() }),
})

const onMessage = socket.defineSubscribe({
  topic: 'chat.message',
  payloadSchema: z.object({ text: z.string(), from: z.string() }),
})

// 4. Use handlers
sendMessage({ text: 'Hello!' })

const unsubscribe = onMessage((msg) => {
  console.log(`${msg.from}: ${msg.text}`)
})

// Later: stop listening
unsubscribe()
```

## API Reference

### `socketBuilder(config?)`

Creates a socket builder instance.

```typescript
const socket = socketBuilder({
  // Optional: Custom message formatter (default: Socket.IO array format)
  formatMessage: (topic, payload, ackId?) => [topic, payload, ackId],

  // Optional: Custom message parser
  parseMessage: (data) => ({ topic: data[0], payload: data[1], ackId: data[2] }),

  // Optional: error hook — receives a SocketError for every failure
  onError: (error) => {
    if (error.kind === 'validation') {
      console.error(`Validation failed for ${error.topic}:`, error.issues)
    } else if (error.kind === 'ack-timeout') {
      console.warn(`Ack timeout for ${error.topic}`)
    } else {
      console.error(`Handler for ${error.topic} failed:`, error.cause)
    }
  },

  // Optional: Default ack timeout in ms (default: 30000)
  ackTimeout: 30000,
})
```

### `socket.provideClient(client)`

Injects a Socket.IO-compatible client. Must be called before using send/subscribe handlers.

```typescript
import { io } from 'socket.io-client'

socket.provideClient(io('ws://localhost:3000'))
```

### `socket.getClient()`

Returns the current client. Throws if no client has been provided.

```typescript
const client = socket.getClient()
```

### `socket.defineSend(options)`

Defines a typed send function for a specific topic.

```typescript
// Fire-and-forget (no acknowledgement)
const sendMessage = socket.defineSend({
  topic: 'chat.message',
  payloadSchema: z.object({ text: z.string() }),
})

sendMessage({ text: 'Hello!' }) // Returns void

// With acknowledgement (request-response pattern)
const createRoom = socket.defineSend({
  topic: 'room.create',
  payloadSchema: z.object({ name: z.string() }),
  ackSchema: z.object({ roomId: z.string(), createdAt: z.string() }),
  ackTimeout: 5000, // Optional: override default timeout
})

const room = await createRoom({ name: 'My Room' }) // Returns Promise<{ roomId: string, createdAt: string }>
console.log(room.roomId)
```

### `socket.defineSubscribe(options)`

Defines a typed subscription function for a specific topic.

```typescript
const onMessage = socket.defineSubscribe({
  topic: 'chat.message',
  payloadSchema: z.object({
    text: z.string(),
    from: z.string(),
    timestamp: z.number(),
  }),
})

// Register handler - returns unsubscribe function
const unsubscribe = onMessage((msg) => {
  // msg is fully typed: { text: string, from: string, timestamp: number }
  console.log(`[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.from}: ${msg.text}`)
})

// Stop listening
unsubscribe()
```

## Using with Native WebSocket

The `declareWebSocket` function creates a WebSocket wrapper that implements the `SocketClient` interface:

```typescript
import { socketBuilder, declareWebSocket } from '@navios/builder/socket'
import { z } from 'zod'

// Create WebSocket declaration
const chatSocket = declareWebSocket({
  url: 'wss://api.example.com/ws/chat/$roomId',
  querySchema: z.object({ token: z.string() }),
  urlParamsSchema: z.object({ roomId: z.string().uuid() }),
  protocols: ['v1.chat'], // Optional: WebSocket sub-protocols
})

// Connect
const handle = chatSocket({
  urlParams: { roomId: 'abc-123' },
  params: { token: 'my-auth-token' },
})

// Use with socketBuilder
const socket = socketBuilder()
socket.provideClient(handle)

// Or use handle directly (Socket.IO-like API)
handle.emit('message', { text: 'Hello!' })
handle.on('message', (data) => console.log(data))
handle.on('connect', () => console.log('Connected!'))
handle.on('disconnect', (reason) => console.log('Disconnected:', reason))

// Close connection
handle.disconnect()
// or
handle.close()
```

The handle also exposes `url` (the full URL it connected to), `connected`, `state` and the underlying `socket`.

### WebSocket Handler Factory

For multiple WebSocket connections with shared configuration:

```typescript
import { createWebSocketHandler } from '@navios/builder/socket'

const declareWebSocket = createWebSocketHandler({
  baseUrl: 'wss://api.example.com',
  // SocketError of kind 'transport': a listener threw or a send failed
  onError: (error) => console.error(`WebSocket error on ${error.topic}:`, error.cause),
})

const chatSocket = declareWebSocket({
  url: '/ws/chat/$roomId',
  urlParamsSchema: z.object({ roomId: z.string() }),
})

const notificationSocket = declareWebSocket({
  url: '/ws/notifications',
})
```

## Schemas

Every schema slot — `payloadSchema` and `ackSchema` on handlers, `urlParamsSchema` and `querySchema` on `declareWebSocket` — accepts any [Standard Schema](https://standardschema.dev) v1 implementation: Zod, Valibot, ArkType and others. Types are inferred from the schema: what you pass is its input type, what you receive is its output type.

```typescript
import * as v from 'valibot'

const onPrice = socket.defineSubscribe({
  topic: 'price',
  payloadSchema: v.object({ symbol: v.string(), value: v.number() }),
})
```

Schemas that validate asynchronously (for example a Zod schema with an async refinement):

| Where                                                | Asynchronous schema                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `defineSubscribe` `payloadSchema`                    | Awaited; the handler runs once validation finishes                                  |
| `defineSend` `ackSchema`                             | Awaited before the promise settles                                                  |
| `defineSend` `payloadSchema` with an `ackSchema`     | Awaited; the message is sent once validation finishes                               |
| `defineSend` `payloadSchema` without an `ackSchema`  | Not supported: the call is synchronous, so it throws a `SocketError`                |
| `declareWebSocket` `urlParamsSchema` / `querySchema` | Not supported: the connection is opened synchronously, so it throws a `NaviosError` |

With a synchronous schema, subscribers are called in the same tick the message arrives. With an asynchronous one they are called when its validation resolves, so two messages may be delivered in a different order than they arrived if their validations take different times. A message whose validation finishes after the handler unsubscribed is dropped.

## Wire Format

By default, messages use Socket.IO-style array format:

```
Send: ['topic', payload]
Send with ack: ['topic', payload, ackId]
Receive: ['topic', payload]
Ack response: ['__navios_ack:ackId', response]
```

### Custom Wire Format

You can customize the wire format for compatibility with different backends:

```typescript
const socket = socketBuilder({
  // Custom JSON object format
  formatMessage: (topic, payload, ackId) => ({
    type: topic,
    data: payload,
    ...(ackId && { requestId: ackId }),
  }),

  parseMessage: (msg) => {
    if (typeof msg === 'object' && msg && 'type' in msg) {
      return {
        topic: (msg as any).type,
        payload: (msg as any).data,
        ackId: (msg as any).requestId,
      }
    }
    return null
  },
})
```

## Type Safety

The socket builder uses TypeScript's const generic inference for full type safety:

```typescript
// Payload types are inferred from schemas
const sendMessage = socket.defineSend({
  topic: 'chat.message',
  payloadSchema: z.object({ text: z.string(), roomId: z.string() }),
})

sendMessage({ text: 'Hello', roomId: '123' }) // OK
sendMessage({ text: 'Hello' }) // Type error: missing 'roomId'
sendMessage({ text: 123 }) // Type error: 'text' must be string

// Return types depend on ackSchema presence
const fireAndForget = socket.defineSend({
  topic: 'ping',
  payloadSchema: z.object({}),
})
fireAndForget({}) // Returns void

const requestResponse = socket.defineSend({
  topic: 'create',
  payloadSchema: z.object({ name: z.string() }),
  ackSchema: z.object({ id: z.string() }),
})
const result = await requestResponse({ name: 'test' }) // Returns Promise<{ id: string }>

// Subscribe handler types are inferred
const onUpdate = socket.defineSubscribe({
  topic: 'update',
  payloadSchema: z.object({ id: z.string(), value: z.number() }),
})

onUpdate((data) => {
  data.id // string
  data.value // number
  data.unknown // Type error: property doesn't exist
})
```

## Handler Config Access

Each handler has a `.config` property with the original options:

```typescript
const sendMessage = socket.defineSend({
  topic: 'chat.message',
  payloadSchema: z.object({ text: z.string() }),
})

console.log(sendMessage.config.topic) // 'chat.message'
console.log(sendMessage.config.payloadSchema) // ZodObject
```

## Error Handling

Every failure is a `SocketError` (`extends NaviosError extends Error`). Send handlers throw it or reject with it, and the builder's `onError` hook receives the same instance. Discriminate on `error.kind`.

```typescript
import { isSocketError, socketBuilder } from '@navios/builder/socket'

const socket = socketBuilder({
  onError: (error) => {
    console.error(`[socket] ${error.kind} on ${error.topic}: ${error.message}`)
  },
})
```

### `SocketError`

| Field     | Type                                           | Description                                                                          |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `kind`    | `'validation' \| 'ack-timeout' \| 'transport'` | Why it failed                                                                        |
| `topic`   | `string`                                       | Topic the send or subscribe handler was defined with                                 |
| `url`     | `string \| undefined`                          | Connection URL, when the client has a `url` property (`declareWebSocket` handles do) |
| `issues`  | `readonly SchemaIssue[] \| undefined`          | Validation issues (`{ message, path? }`), for `validation`                           |
| `rawData` | `unknown`                                      | The value that failed validation, for `validation`                                   |
| `cause`   | `unknown`                                      | The schema library's own error (a `ZodError` for Zod), or the value a handler threw  |
| `message` | `string`                                       | Human-readable description                                                           |

`error.toJSON()` returns the same fields as a plain object without `cause`. `isSocketError(value)` is the type guard for `catch` blocks.

### Kinds

| Kind          | When                                                                     | What happens                                       |
| ------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `validation`  | `payloadSchema` rejects the payload passed to a send handler             | The send handler throws; nothing is sent           |
| `validation`  | `payloadSchema` rejects an incoming message                              | The message is skipped; subscribers are not called |
| `validation`  | `ackSchema` rejects an acknowledgement                                   | The send promise rejects                           |
| `ack-timeout` | No acknowledgement arrived within `ackTimeout`                           | The send promise rejects                           |
| `transport`   | A subscribe handler threw (`cause` is the thrown value)                  | The other subscribers of the topic still run       |
| `transport`   | `provideClient` replaced the client while an acknowledgement was pending | The send promise rejects                           |

`onError` is called once for each of these.

### Validation Errors

```typescript
const socket = socketBuilder({
  onError: (error) => {
    if (error.kind === 'validation') {
      console.error(`Invalid data on ${error.topic}:`, {
        issues: error.issues,
        rawData: error.rawData,
      })
    }
  },
})
```

A send handler reports an invalid payload to the caller as well:

```typescript
try {
  sendMessage({ text: 123 as never })
} catch (error) {
  if (isSocketError(error) && error.kind === 'validation') {
    error.issues // [{ message: 'Invalid input: expected string, received number', path: ['text'], ... }]
    error.cause // the ZodError
  }
}
```

### Acknowledgement Timeouts

```typescript
const socket = socketBuilder({ ackTimeout: 5000 })

try {
  const result = await createRoom({ name: 'Test' })
} catch (error) {
  if (isSocketError(error) && error.kind === 'ack-timeout') {
    // error.message: Acknowledgement timeout for topic "room.create" (ackId: ...)
  }
}
```

### Handler Errors

A subscribe handler that throws does not affect the other handlers of the topic. The thrown value is reported as `kind: 'transport'` with the original on `error.cause`.

### The `onError` Hook

The hook is for telemetry. An exception thrown inside it is caught and logged with `console.error`; it never interrupts message handling and never changes what a send handler throws.

`createWebSocketHandler({ onError })` has the same contract for the handle itself: a listener registered with `handle.on()` that throws, or a failed `WebSocket.send`, is reported as a `SocketError` of kind `transport` with `topic` set to the event name and `url` to the connection URL.

### Client Not Provided

Calling handlers before `provideClient()` throws a `NaviosError`:

```typescript
const socket = socketBuilder()
const send = socket.defineSend({ topic: 'test', payloadSchema: z.object({}) })

send({}) // Throws: [Navios-Socket]: Client was not provided
```

## Comparison with HTTP Builder

| Feature | HTTP Builder           | Socket Builder                           |
| ------- | ---------------------- | ---------------------------------------- |
| Import  | `@navios/builder`      | `@navios/builder/socket`                 |
| Client  | `provideClient(axios)` | `provideClient(io())`                    |
| Define  | `declareEndpoint()`    | `defineSend()` / `defineSubscribe()`     |
| Return  | `Promise<Response>`    | `void` or `Promise<Ack>` / `Unsubscribe` |
| Pattern | Request-Response       | Pub-Sub + Request-Response               |
