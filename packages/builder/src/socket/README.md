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

  // Optional: Validation error callback
  onValidationError: (error, topic, rawData) => {
    console.error(`Validation failed for ${topic}:`, error)
  },

  // Optional: Acknowledgement timeout callback
  onAckTimeout: (topic, ackId) => {
    console.warn(`Ack timeout for ${topic}`)
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

### WebSocket Handler Factory

For multiple WebSocket connections with shared configuration:

```typescript
import { createWebSocketHandler } from '@navios/builder/socket'

const declareWebSocket = createWebSocketHandler({
  baseUrl: 'wss://api.example.com',
  onError: (error) => console.error('WebSocket error:', error),
})

const chatSocket = declareWebSocket({
  url: '/ws/chat/$roomId',
  urlParamsSchema: z.object({ roomId: z.string() }),
})

const notificationSocket = declareWebSocket({
  url: '/ws/notifications',
})
```

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

### Validation Errors

When incoming messages fail schema validation, they are skipped and the `onValidationError` callback is called:

```typescript
const socket = socketBuilder({
  onValidationError: (error, topic, rawData) => {
    console.error(`Invalid message on ${topic}:`, error)
    // Optionally report to error tracking service
  },
})
```

### Acknowledgement Timeouts

When an acknowledgement times out, the Promise rejects and `onAckTimeout` is called:

```typescript
const socket = socketBuilder({
  ackTimeout: 5000, // 5 seconds
  onAckTimeout: (topic, ackId) => {
    console.warn(`Request to ${topic} timed out`)
  },
})

try {
  const result = await createRoom({ name: 'Test' })
} catch (error) {
  // Error: Acknowledgement timeout for topic "room.create" (ackId: ...)
}
```

### Client Not Provided

Calling handlers before `provideClient()` throws an error:

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
