---
title: Server-Sent Events
---

# Server-Sent Events

`@navios/builder/eventsource` types a one-way stream from the server: you declare the connection and each event once, and your listeners receive validated payloads. Use it when the client only listens. If it also sends, see the comparison on the [WebSocket](/docs/builder/realtime/websocket) page.

## Declare the connection

`declareEventSource` describes the stream's URL the way `declareEndpoint` describes a request. Calling the result opens a browser `EventSource` and returns a handle.

```ts title="events.ts"
import { declareEventSource } from '@navios/builder/eventsource'

export const teamEvents = declareEventSource({
  url: 'https://api.example.com/teams/$teamId/events',
  withCredentials: true,
})

const handle = teamEvents({ urlParams: { teamId: '7' } })
```

| Option            | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `url`             | URL template; `$name` marks a URL parameter                              |
| `urlParamsSchema` | Validates and types `urlParams`; without it they are `string \| number`  |
| `querySchema`     | Validates and types `params`, which become the query string              |
| `withCredentials` | Send cookies with the request                                            |

Both schemas must validate synchronously, because the connection opens synchronously. A declaration with no URL parameters and no `querySchema` is called without arguments.

When several streams share a host, `createEventSourceHandler({ baseUrl, onError })` returns a `declareEventSource` with the base URL applied.

## Define events

An event builder holds the connection and hands out one typed subscribe function per event name.

```ts
import { eventSourceBuilder } from '@navios/builder/eventsource'
import { z } from 'zod/v4'

export const sse = eventSourceBuilder()

// userSchema from the Quick start
export const onUserUpdated = sse.defineEvent({
  eventName: 'user.updated',
  payloadSchema: userSchema,
})

export const onUserDeleted = sse.defineEvent({
  eventName: 'user.deleted',
  payloadSchema: z.object({ id: z.string() }),
})
```

`eventName` is the `event:` field of the stream. Events sent without one arrive under the name `message`. Each event's `data` is parsed as JSON before validation, and stays a string when it is not JSON.

## Connect and listen

Give the handle to the builder, then subscribe. Each subscribe function returns its own unsubscribe function.

```ts
sse.provideClient(teamEvents({ urlParams: { teamId: '7' } }))

const stop = onUserUpdated((user) => {
  console.log(user.name)
  //          ^? string
})

stop()
sse.getClient().close()
```

The order is flexible: listeners registered before `provideClient` are attached when the client arrives. Calling `provideClient` again moves every listener to the new connection and closes the old one, which is how you reconnect with different parameters.

An event that fails `payloadSchema` is skipped; your listener only sees valid data. A listener that throws does not stop the others.

## The handle

The value returned by a `declareEventSource` declaration wraps the `EventSource`:

| Member                 | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `on(event, listener)`  | Listen to an event by name, untyped                                          |
| `off(event, listener?)`| Remove one listener, or all listeners of the event                           |
| `onOpen(listener)`     | Called when the connection opens, and at once if it is already open          |
| `onError(listener)`    | Called with the browser's `Event` when the connection fails                  |
| `close()`              | Close the connection and drop every listener                                 |
| `url`                  | The full URL the connection was opened with                                  |
| `connected`            | `true` while the connection is open                                          |
| `state`                | `'connecting' \| 'open' \| 'closed'`                                         |
| `source`               | The underlying `EventSource`                                                 |

`onOpen` and `onError` return an unsubscribe function.

Connection failures are not `EventSourceError`s. They are plain browser events. The browser normally reconnects on its own; `state` becomes `'closed'` once it has given up or you have called `close()`:

```ts
const handle = teamEvents({ urlParams: { teamId: '7' } })

handle.onError(() => {
  if (handle.state === 'closed') showOffline()
})
```

Anything with `on`, `off`, `close` and `connected` can stand in for the handle in `provideClient`, which is how you plug in a custom transport or a fake in tests.

## Errors

Failures while handling an event have no caller to throw to, so they are reported to the builder's `onError` hook as an `EventSourceError`.

| `kind`       | When                                          | What happens                    |
| ------------ | --------------------------------------------- | ------------------------------- |
| `validation` | `payloadSchema` rejects an incoming event     | The event is skipped            |
| `transport`  | A listener threw                              | The other listeners still run   |

An `EventSourceError` carries `kind`, `eventName`, `message`, and where they apply `url` (the connection URL), `issues`, `rawData` (the event data that failed validation) and `cause` (the schema library's own error, or the value the listener threw). `toJSON()` returns the same fields without `cause`, and `isEventSourceError(value)` is the type guard.

### The onError hook

```ts
const sse = eventSourceBuilder({
  onError: (error) => {
    if (error.kind === 'validation') {
      console.error(`Invalid ${error.eventName} event`, error.issues, error.rawData)
    } else {
      console.error(`Listener for ${error.eventName} failed`, error.cause)
    }
  },
})
```

The hook is called once per failure and is meant for telemetry. An exception thrown inside it is caught and logged, and never changes how an event is handled.

`createEventSourceHandler({ onError })` has the same contract for listeners registered directly on a handle with `on`, `onOpen` or `onError`: one that throws is reported as kind `transport`.

Related: [Realtime updates](/docs/builder/react-query/recipes/realtime-updates) pushes these events into the React Query cache, and the [API reference](/docs/builder/reference/builder) lists every export of this entry point.
