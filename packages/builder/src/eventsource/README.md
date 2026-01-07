# EventSource Builder

A declarative, type-safe builder for Server-Sent Events (SSE) with Zod schema validation.

## Installation

The EventSource builder is part of `@navios/builder`:

```bash
npm install @navios/builder
# or
yarn add @navios/builder
```

## Quick Start

```typescript
import { eventSourceBuilder, declareEventSource } from '@navios/builder/eventsource'
import { z } from 'zod'

// 1. Create a builder instance
const sse = eventSourceBuilder({
  onValidationError: (error, eventName, data) => {
    console.error(`Validation failed for ${eventName}:`, error)
  },
  onError: (error) => {
    console.error('Handler error:', error)
  },
})

// 2. Define typed event handlers
const onMessage = sse.defineEvent({
  eventName: 'message',
  payloadSchema: z.object({
    text: z.string(),
    from: z.string(),
    timestamp: z.number(),
  }),
})

const onTyping = sse.defineEvent({
  eventName: 'typing',
  payloadSchema: z.object({ userId: z.string() }),
})

// 3. Declare the EventSource connection
const chatEvents = declareEventSource({
  url: '/events/$roomId',
  urlParamsSchema: z.object({ roomId: z.string() }),
  querySchema: z.object({ token: z.string().optional() }),
})

// 4. Connect and provide the client
const handle = chatEvents({ urlParams: { roomId: '123' } })
sse.provideClient(handle)

// 5. Subscribe to events with full type safety
const unsubMessage = onMessage((msg) => {
  // msg is typed as { text: string, from: string, timestamp: number }
  console.log(`${msg.from}: ${msg.text}`)
})

const unsubTyping = onTyping((data) => {
  // data is typed as { userId: string }
  console.log(`${data.userId} is typing...`)
})

// 6. Cleanup when done
unsubMessage()
unsubTyping()
sse.getClient().close()
```

## API Reference

### `eventSourceBuilder(config?)`

Creates a new EventSource builder instance.

#### Config Options

| Option | Type | Description |
|--------|------|-------------|
| `onValidationError` | `(error, eventName, rawData) => void` | Called when incoming event data fails Zod validation |
| `onError` | `(error) => void` | Called when an event handler throws an error |

#### Returns: `EventSourceBuilderInstance`

| Method | Description |
|--------|-------------|
| `provideClient(client)` | Set the EventSource client (from `declareEventSource`) |
| `getClient()` | Get the current client (throws if not set) |
| `defineEvent(options)` | Define a typed event handler |

### `declareEventSource(options)`

Declares an EventSource endpoint. Returns a handler function that creates connections.

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | EventSource URL (supports `$param` placeholders) |
| `urlParamsSchema` | `ZodObject` | Optional schema for URL parameter validation |
| `querySchema` | `ZodObject` | Optional schema for query parameters |
| `withCredentials` | `boolean` | Include credentials (cookies) in requests |

#### Usage

```typescript
// Without params
const events = declareEventSource({ url: '/events' })
const handle = events()

// With URL params
const chatEvents = declareEventSource({
  url: '/events/$roomId',
  urlParamsSchema: z.object({ roomId: z.string() }),
})
const handle = chatEvents({ urlParams: { roomId: '123' } })

// With query params
const filteredEvents = declareEventSource({
  url: '/events',
  querySchema: z.object({
    since: z.string().optional(),
    limit: z.number().optional(),
  }),
})
const handle = filteredEvents({ params: { since: '2024-01-01' } })
```

### `createEventSourceHandler(config?)`

Factory function for creating `declareEventSource` with shared configuration.

```typescript
const declareEventSource = createEventSourceHandler({
  baseUrl: 'https://api.example.com',
  onError: (error) => console.error('Connection error:', error),
})

const chatEvents = declareEventSource({
  url: '/events/$roomId',
})
```

### `defineEvent(options)`

Defines a typed event handler on the builder instance.

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `eventName` | `string` | SSE event name to listen for |
| `payloadSchema` | `ZodType` | Optional schema for payload validation |

#### Returns

A function that registers handlers and returns an unsubscribe function:

```typescript
const onMessage = sse.defineEvent({
  eventName: 'message',
  payloadSchema: z.object({ text: z.string() }),
})

// Register a handler
const unsubscribe = onMessage((payload) => {
  // payload is typed based on payloadSchema
  console.log(payload.text)
})

// Later: stop listening
unsubscribe()
```

## EventSourceHandle Interface

The handle returned by `declareEventSource()()` implements `EventSourceClient`:

```typescript
interface EventSourceHandle {
  // Register an event listener
  on(event: string, handler: (data: unknown) => void): void

  // Remove an event listener
  off(event: string, handler?: (data: unknown) => void): void

  // Register error handler (returns unsubscribe)
  onError(handler: (error: Event) => void): () => void

  // Register open handler (returns unsubscribe)
  onOpen(handler: (event: Event) => void): () => void

  // Close the connection
  close(): void

  // Connection status
  readonly connected: boolean
  readonly state: 'connecting' | 'open' | 'closed'

  // Access underlying EventSource
  readonly source: EventSource
}
```

## Type Safety

The builder provides full TypeScript inference:

```typescript
const onUser = sse.defineEvent({
  eventName: 'user.joined',
  payloadSchema: z.object({
    userId: z.string(),
    name: z.string(),
    joinedAt: z.number(),
  }),
})

onUser((user) => {
  // TypeScript knows:
  // user.userId: string
  // user.name: string
  // user.joinedAt: number
})
```

## Comparison with WebSocket Builder

The EventSource builder follows the same pattern as the WebSocket/Socket builder:

| Feature | EventSource | Socket |
|---------|-------------|--------|
| Builder | `eventSourceBuilder()` | `socketBuilder()` |
| Connection | `declareEventSource()` | `declareWebSocket()` |
| Define handlers | `defineEvent()` | `defineSend()` / `defineSubscribe()` |
| Direction | Server → Client only | Bidirectional |
| Protocol | HTTP/SSE | WebSocket |

## Best Practices

1. **Define event handlers before connecting** - This ensures handlers are registered when the connection opens.

2. **Use schemas for validation** - Zod schemas provide runtime validation and TypeScript types.

3. **Handle cleanup properly** - Always unsubscribe from events and close connections when done.

4. **Use `onValidationError` for debugging** - Log validation errors to catch schema mismatches.

```typescript
const sse = eventSourceBuilder({
  onValidationError: (error, eventName, rawData) => {
    console.error(`Invalid ${eventName} event:`, { error, rawData })
  },
})
```

5. **Separate connection declaration from usage** - Declare connections once, use multiple times:

```typescript
// api/events.ts
export const chatEvents = declareEventSource({
  url: '/events/$roomId',
  urlParamsSchema: z.object({ roomId: z.string() }),
})

// components/ChatRoom.tsx
const handle = chatEvents({ urlParams: { roomId } })
```
