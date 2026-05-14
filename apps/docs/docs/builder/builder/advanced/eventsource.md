---
sidebar_position: 4
---

# Server-Sent Events (SSE)

Server-Sent Events support in `@navios/builder` provides type-safe, unidirectional event streaming with Zod schema validation. Perfect for live updates, notifications, and real-time data feeds.

## Overview

The EventSource builder (`@navios/builder/eventsource`) allows you to:

- Define type-safe event handlers with Zod schemas
- Handle multiple event types from a single connection
- Validate incoming events at runtime
- Get full TypeScript type inference from your schemas
- Use URL parameters and query strings in connection URLs

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

// 1. Create a builder instance — `onError` receives a structured BuilderErrorEvent
const sse = eventSourceBuilder({
  onError: (event) => {
    if (event.kind === 'validation') {
      console.error(`Validation failed for ${event.eventName}:`, event.zodIssues)
    } else if (event.kind === 'event-source-transport') {
      console.error('Transport error:', event.cause)
    } else {
      console.error('Handler error:', event.cause)
    }
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
| `onError` | `(event: BuilderErrorEvent) => void` | Unified error hook fired on every failure path. Filter on `event.kind`: `'validation'` (Zod failure — `event.eventName`, `event.rawData`, `event.zodIssues` are populated) or `'event-source-transport'` (network/EventSource transport failure). |

The v1 separate `onValidationError` and legacy `onError(error)` callbacks were removed in v2 — both flow through the unified `onError(event)` now.

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

## Common Patterns

### Multiple Event Types

```typescript
const sse = eventSourceBuilder()

const onMessage = sse.defineEvent({
  eventName: 'message',
  payloadSchema: z.object({ text: z.string(), from: z.string() }),
})

const onTyping = sse.defineEvent({
  eventName: 'typing',
  payloadSchema: z.object({ userId: z.string() }),
})

const onUserJoined = sse.defineEvent({
  eventName: 'user.joined',
  payloadSchema: z.object({ userId: z.string(), name: z.string() }),
})

const chatEvents = declareEventSource({
  url: '/events/$roomId',
  urlParamsSchema: z.object({ roomId: z.string() }),
})

const handle = chatEvents({ urlParams: { roomId: '123' } })
sse.provideClient(handle)

// Subscribe to all events
const unsubMessage = onMessage((msg) => console.log('Message:', msg))
const unsubTyping = onTyping((data) => console.log('Typing:', data))
const unsubJoined = onUserJoined((user) => console.log('Joined:', user))
```

### Connection Lifecycle

```typescript
const sse = eventSourceBuilder()
const events = declareEventSource({ url: '/events' })

const handle = events()

handle.onOpen(() => {
  console.log('Connected to event stream')
})

handle.onError((error) => {
  console.error('Event stream error:', error)
  // Handle reconnection logic here
})

sse.provideClient(handle)

// Later: cleanup
sse.getClient().close()
```

### With Query Parameters

```typescript
const filteredEvents = declareEventSource({
  url: '/events',
  querySchema: z.object({
    since: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
})

const handle = filteredEvents({
  params: {
    since: '2024-01-01T00:00:00Z',
    limit: 100,
  },
})
```

## Error Handling

All errors flow through the unified `onError(event)` hook. Filter on `event.kind`:

### Validation Errors (`event.kind === 'validation'`)

When incoming event data fails Zod validation, the event is skipped and `onError` fires with `event.kind === 'validation'`:

```typescript
const sse = eventSourceBuilder({
  onError: (event) => {
    if (event.kind === 'validation') {
      console.error(`Invalid ${event.eventName} event:`, {
        zodIssues: event.zodIssues,
        rawData: event.rawData,
      })
    }
  },
})
```

### Transport Errors (`event.kind === 'event-source-transport'`)

Network or EventSource transport failures fire with `event.kind === 'event-source-transport'`:

```typescript
const sse = eventSourceBuilder({
  onError: (event) => {
    if (event.kind === 'event-source-transport') {
      console.error('SSE transport error:', event.cause)
    }
  },
})
```

### Connection Errors

Handle connection errors using the EventSource handle:

```typescript
const handle = chatEvents({ urlParams: { roomId: '123' } })

handle.onError((event) => {
  console.error('Connection error:', event)
  // Implement reconnection logic
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

## When to Use SSE vs WebSocket

### Use SSE when:
- You only need server-to-client communication
- You want HTTP-based streaming (works through firewalls/proxies)
- You need automatic reconnection handling
- You're sending text-based events

### Use WebSocket when:
- You need bidirectional communication
- You need binary data support
- You need lower latency
- You need custom protocols

## Best Practices

1. **Define event handlers before connecting** - This ensures handlers are registered when the connection opens.

2. **Use schemas for validation** - Zod schemas provide runtime validation and TypeScript types.

3. **Handle cleanup properly** - Always unsubscribe from events and close connections when done.

```typescript
const unsubMessage = onMessage((msg) => console.log(msg))

// Later, when component unmounts or connection is no longer needed:
unsubMessage()
sse.getClient().close()
```

4. **Use the unified `onError` hook for debugging** - Log validation failures by filtering on `event.kind === 'validation'`.

```typescript
const sse = eventSourceBuilder({
  onError: (event) => {
    if (event.kind === 'validation') {
      console.error(`Invalid ${event.eventName} event:`, {
        zodIssues: event.zodIssues,
        rawData: event.rawData,
      })
    }
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
sse.provideClient(handle)
```

6. **Handle reconnection** - EventSource automatically reconnects, but you may want to handle reconnection logic:

```typescript
const handle = chatEvents({ urlParams: { roomId: '123' } })

handle.onError((event) => {
  if (handle.state === 'closed') {
    // Connection closed, may need to recreate
    console.log('Connection closed, will reconnect automatically')
  }
})
```

## Next Steps

- [WebSocket](/docs/builder/builder/advanced/websocket) - Learn about bidirectional WebSocket support
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Review HTTP endpoint basics
- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle errors gracefully
