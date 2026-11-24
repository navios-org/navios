---
sidebar_position: 4
---

# Server-Sent Events (SSE)

Server-Sent Events support in `@navios/builder` provides type-safe, unidirectional event streaming with schema validation. Perfect for live updates, notifications, and real-time data feeds.

## Overview

The EventSource builder (`@navios/builder/eventsource`) allows you to:

- Define type-safe event handlers with Zod or any other Standard Schema library
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

// 1. Create a builder instance — `onError` receives an EventSourceError
const sse = eventSourceBuilder({
  onError: (error) => {
    if (error.kind === 'validation') {
      console.error(`Validation failed for ${error.eventName}:`, error.issues)
    } else {
      console.error(`Handler for ${error.eventName} failed:`, error.cause)
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
| `onError` | `(error: EventSourceError) => void` | Called once for every failure. Filter on `error.kind`: `'validation'` (an event failed `payloadSchema` — `error.issues` and `error.rawData` are set) or `'transport'` (a handler threw — the thrown value is on `error.cause`). See [Error Handling](#error-handling). |

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
| `urlParamsSchema` | `Schema` | Optional schema for URL parameter validation (any Standard Schema, synchronous) |
| `querySchema` | `Schema` | Optional schema for query parameters (any Standard Schema, synchronous) |
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

Query parameters are appended after validation: `undefined` and `null` are skipped, a `Date` is written as `toISOString()`, an array repeats its key once per item (`tag=a&tag=b`), and a URL that already contains a query string is continued with `&`.

### `createEventSourceHandler(config?)`

Factory function for creating `declareEventSource` with shared configuration.

```typescript
const declareEventSource = createEventSourceHandler({
  baseUrl: 'https://api.example.com',
  // EventSourceError of kind 'transport': a listener registered on the handle threw
  onError: (error) => console.error(`Listener for ${error.eventName} failed:`, error.cause),
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
| `payloadSchema` | `Schema` | Optional schema for payload validation (any Standard Schema) |

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

  // Full URL the connection was opened with
  readonly url: string

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

## Schemas

Every schema slot — `payloadSchema` on `defineEvent`, `urlParamsSchema` and `querySchema` on `declareEventSource` — accepts any [Standard Schema](https://standardschema.dev) v1 implementation: Zod, Valibot, ArkType and others. Handlers receive the schema's output type; connection parameters take its input type.

```typescript
import * as v from 'valibot'

const onPrice = sse.defineEvent({
  eventName: 'price',
  payloadSchema: v.object({ symbol: v.string(), value: v.number() }),
})
```

A `payloadSchema` that validates asynchronously (for example a Zod schema with an async refinement) is awaited before the handler runs. With a synchronous schema, handlers are called in the same tick the event arrives; with an asynchronous one they are called when its validation resolves, so two events may be delivered in a different order than they arrived if their validations take different times. An event whose validation finishes after the handler unsubscribed is dropped.

`urlParamsSchema` and `querySchema` must validate synchronously, because the connection is opened synchronously; an asynchronous schema there throws a `NaviosError`.

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

An event that fails `payloadSchema` is skipped, and a handler that throws does not stop the other handlers. Both are reported to the builder's `onError` hook as an `EventSourceError` (`extends NaviosError extends Error`). Discriminate on `error.kind`.

```typescript
import { eventSourceBuilder } from '@navios/builder/eventsource'

const sse = eventSourceBuilder({
  onError: (error) => {
    console.error(`[sse] ${error.kind} on ${error.eventName}: ${error.message}`)
  },
})
```

### `EventSourceError`

| Field       | Type                                  | Description                                                                             |
| ----------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `kind`      | `'validation' \| 'transport'`         | Why it failed                                                                           |
| `eventName` | `string`                              | Event the handler was defined for                                                       |
| `url`       | `string \| undefined`                 | Connection URL, when the client has a `url` property (`declareEventSource` handles do)  |
| `issues`    | `readonly SchemaIssue[] \| undefined` | Validation issues (`{ message, path? }`), for `validation`                              |
| `rawData`   | `unknown`                             | The event data that failed validation, for `validation`                                 |
| `cause`     | `unknown`                             | The schema library's own error (a `ZodError` for Zod), or the value a handler threw     |
| `message`   | `string`                              | Human-readable description                                                              |

`error.toJSON()` returns the same fields as a plain object without `cause`. `isEventSourceError(value)` is the type guard.

### Validation Errors (`error.kind === 'validation'`)

```typescript
const sse = eventSourceBuilder({
  onError: (error) => {
    if (error.kind === 'validation') {
      console.error(`Invalid ${error.eventName} event:`, {
        issues: error.issues,
        rawData: error.rawData,
      })
    }
  },
})
```

### Handler Errors (`error.kind === 'transport'`)

A handler registered through `defineEvent` that throws is reported with the thrown value on `error.cause`:

```typescript
const sse = eventSourceBuilder({
  onError: (error) => {
    if (error.kind === 'transport') {
      console.error(`Handler for ${error.eventName} failed:`, error.cause)
    }
  },
})
```

### The `onError` Hook

The hook is for telemetry. An exception thrown inside it is caught and logged with `console.error`; it never interrupts event handling.

`createEventSourceHandler({ onError })` has the same contract for the handle itself: a listener registered with `handle.on()`, `handle.onOpen()` or `handle.onError()` that throws is reported as an `EventSourceError` of kind `transport`, with `eventName` set to the event (`'open'` and `'error'` for the last two) and `url` to the connection URL.

### Connection Errors

Connection failures are browser `Event`s delivered by the `EventSource` itself. Listen for them on the handle:

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

2. **Use schemas for validation** - Schemas provide runtime validation and TypeScript types.

3. **Handle cleanup properly** - Always unsubscribe from events and close connections when done.

```typescript
const unsubMessage = onMessage((msg) => console.log(msg))

// Later, when component unmounts or connection is no longer needed:
unsubMessage()
sse.getClient().close()
```

4. **Use the `onError` hook for debugging** - Log validation failures by filtering on `error.kind === 'validation'`.

```typescript
const sse = eventSourceBuilder({
  onError: (error) => {
    if (error.kind === 'validation') {
      console.error(`Invalid ${error.eventName} event:`, {
        issues: error.issues,
        rawData: error.rawData,
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
