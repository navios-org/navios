# EventSource Builder

A declarative, type-safe builder for Server-Sent Events (SSE) with schema validation (Zod or any other Standard Schema library).

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

| Option    | Type                                | Description                                                                                                                              |
| --------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `onError` | `(error: EventSourceError) => void` | Called once for every failure: an event that failed `payloadSchema` (`kind: 'validation'`) or a handler that threw (`kind: 'transport'`) |

#### Returns: `EventSourceBuilderInstance`

| Method                  | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `provideClient(client)` | Set the EventSource client (from `declareEventSource`) |
| `getClient()`           | Get the current client (throws if not set)             |
| `defineEvent(options)`  | Define a typed event handler                           |

### `declareEventSource(options)`

Declares an EventSource endpoint. Returns a handler function that creates connections.

#### Options

| Option            | Type      | Description                                      |
| ----------------- | --------- | ------------------------------------------------ |
| `url`             | `string`  | EventSource URL (supports `$param` placeholders) |
| `urlParamsSchema` | `Schema`  | Optional schema for URL parameter validation     |
| `querySchema`     | `Schema`  | Optional schema for query parameters             |
| `withCredentials` | `boolean` | Include credentials (cookies) in requests        |

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

| Option          | Type     | Description                            |
| --------------- | -------- | -------------------------------------- |
| `eventName`     | `string` | SSE event name to listen for           |
| `payloadSchema` | `Schema` | Optional schema for payload validation |

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

| Field       | Type                                  | Description                                                                            |
| ----------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `kind`      | `'validation' \| 'transport'`         | Why it failed                                                                          |
| `eventName` | `string`                              | Event the handler was defined for                                                      |
| `url`       | `string \| undefined`                 | Connection URL, when the client has a `url` property (`declareEventSource` handles do) |
| `issues`    | `readonly SchemaIssue[] \| undefined` | Validation issues (`{ message, path? }`), for `validation`                             |
| `rawData`   | `unknown`                             | The event data that failed validation, for `validation`                                |
| `cause`     | `unknown`                             | The schema library's own error (a `ZodError` for Zod), or the value a handler threw    |
| `message`   | `string`                              | Human-readable description                                                             |

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

| Feature         | EventSource            | Socket                               |
| --------------- | ---------------------- | ------------------------------------ |
| Builder         | `eventSourceBuilder()` | `socketBuilder()`                    |
| Connection      | `declareEventSource()` | `declareWebSocket()`                 |
| Define handlers | `defineEvent()`        | `defineSend()` / `defineSubscribe()` |
| Direction       | Server → Client only   | Bidirectional                        |
| Protocol        | HTTP/SSE               | WebSocket                            |

## Best Practices

1. **Define event handlers before connecting** - This ensures handlers are registered when the connection opens.

2. **Use schemas for validation** - Schemas provide runtime validation and TypeScript types.

3. **Handle cleanup properly** - Always unsubscribe from events and close connections when done.

4. **Use `onError` for debugging** - Log validation errors to catch schema mismatches.

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
```
