---
title: Realtime updates
---

# Realtime updates

When the server pushes events over a WebSocket or Server-Sent Events, the cache is where they should land: every component reading the affected query re-renders, and nothing else needs to know a socket exists. This recipe connects Builder's typed [WebSocket](/docs/builder/realtime/websocket) and [SSE](/docs/builder/realtime/server-sent-events) subscriptions to a query's `setData` and `invalidate`.

## Write or invalidate

Each event leads to one of two cache operations:

- **The event carries the new data.** Write it with `setData`. No request is made.
- **The event only says something changed.** Call `invalidate`. Mounted queries refetch; the rest are marked stale and refetch when next used.

Lists usually get `invalidate` even when the event carries the item, because the event cannot tell you where the item belongs in every filtered and paginated variant you have cached.

## From a WebSocket

Declare the connection and one subscription per topic. The payload schemas reuse what the HTTP endpoints already validate with.

```ts title="events.ts"
import { declareWebSocket, socketBuilder } from '@navios/builder/socket'
import { z } from 'zod/v4'

// userSchema from the Builder quick start
export const socket = socketBuilder()

export const connectEvents = declareWebSocket({ url: 'wss://api.example.com/events' })

export const onUserUpdated = socket.defineSubscribe({
  topic: 'user.updated',
  payloadSchema: userSchema,
})

export const onUserDeleted = socket.defineSubscribe({
  topic: 'user.deleted',
  payloadSchema: z.object({ userId: z.string() }),
})
```

Then bridge them to the cache in one hook, mounted once near the root of the app:

```tsx
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

// userQuery from the React Query quick start; usersQuery from Queries
export function useUserEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const connection = connectEvents()
    socket.provideClient(connection)

    const stop = [
      onUserUpdated((user) => {
        // The event is the user: write it, then refresh the lists
        userQuery.setData(queryClient, { urlParams: { userId: user.id } }, user)
        void usersQuery.invalidate(queryClient)
      }),
      onUserDeleted(({ userId }) => {
        queryClient.removeQueries({ queryKey: userQuery.key({ urlParams: { userId } }) })
        void usersQuery.invalidate(queryClient)
      }),
    ]

    return () => {
      stop.forEach((unsubscribe) => unsubscribe())
      connection.close()
    }
  }, [queryClient])
}
```

The handlers receive validated payloads: `user` has the type `userQuery` stores, so `setData` accepts it as is. A message that fails its schema is skipped and never reaches the cache; it is reported to the `onError` hook of `socketBuilder`.

## From Server-Sent Events

The SSE builder has the same shape, with events in place of topics.

```ts title="events.ts"
import { declareEventSource, eventSourceBuilder } from '@navios/builder/eventsource'

export const sse = eventSourceBuilder()

export const connectUserEvents = declareEventSource({ url: '/users/events' })

export const onUserUpdated = sse.defineEvent({
  eventName: 'user.updated',
  payloadSchema: userSchema,
})
```

```tsx
useEffect(() => {
  const connection = connectUserEvents()
  sse.provideClient(connection)

  const unsubscribe = onUserUpdated((user) => {
    userQuery.setData(queryClient, { urlParams: { userId: user.id } }, user)
  })

  return () => {
    unsubscribe()
    connection.close()
  }
}, [queryClient])
```

## Updating part of an entry

An event often carries a fragment: a new item, a changed field. Pass `setData` a function; it receives the current value, typed, or `undefined` when nothing is cached.

```ts
// onUserRenamed: a subscription whose payload is { userId, name }
onUserRenamed(({ userId, name }) => {
  userQuery.setData(queryClient, { urlParams: { userId } }, (user) => user && { ...user, name })

  usersQuery.setData(queryClient, {}, (users) =>
    users?.map((user) => (user.id === userId ? { ...user, name } : user)),
  )
})
```

Returning `undefined` for an empty entry leaves it empty, which is what you want: there is no point creating a partial entry that a later fetch would have to correct.

`setData` addresses exactly one entry, the one for the arguments you pass. To change every cached variant of a list, either invalidate the endpoint or use TanStack's `queryClient.setQueriesData` with `usersQuery.key()` as the filter:

```ts
import type { InferEndpointReturn } from '@navios/builder'

type Users = InferEndpointReturn<typeof usersQuery.endpoint.config>

queryClient.setQueriesData<Users>({ queryKey: usersQuery.key() }, (users) =>
  users?.map((user) => (user.id === userId ? { ...user, name } : user)),
)
```

`key()` matches only the entries of `usersQuery` itself, which all hold a list. An infinite query or a `withResponse` query declared on the same endpoint keeps its entries under another key, so the updater never receives their data.

## After a reconnect

Events sent while the connection was down are lost, so cached data may be behind. A browser `EventSource` reconnects on its own; invalidate what the stream feeds each time it opens:

```ts
const stopOnOpen = connection.onOpen(() => {
  void usersQuery.invalidate(queryClient)
})
```

The first open after mounting triggers it too, which costs one refetch of the mounted queries. A `declareWebSocket` connection does not reconnect; when your code opens a new one, invalidate after `provideClient`.

## Polling

When the server cannot push, poll. That is plain TanStack Query: pass `refetchInterval`, a number or a function of the query, in the hook's options.

```ts
usersQuery.use({}, { refetchInterval: 5000 })
```

See TanStack's [`useQuery` reference](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) for `refetchInterval`, `refetchIntervalInBackground` and `refetchOnWindowFocus`.
