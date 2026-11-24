---
sidebar_position: 3
---

# Real-time Updates

Patterns for keeping cached data up to date: polling, refetching on focus, and applying pushed events to the cache.

## Polling

`refetchInterval` is a TanStack option, passed as the hook's second argument:

```typescript
function NotificationList() {
  const { data } = listNotifications.use({}, { refetchInterval: 5000 })

  return <div>{/* Render notifications */}</div>
}
```

## Conditional Polling

`refetchInterval` may be a function of the query; return `false` to stop:

```typescript
function JobStatus({ jobId }: { jobId: string }) {
  const { data } = getJob.use(
    { urlParams: { jobId } },
    {
      refetchInterval: (query) =>
        query.state.data?.status === 'running' ? 2000 : false,
    },
  )

  return <div>{data?.status}</div>
}
```

## Refetch on Window Focus

```typescript
const { data } = getUser.use(
  { urlParams: { userId } },
  { refetchOnWindowFocus: true, staleTime: 10_000 },
)
```

## Manual Refresh

```typescript
function RefreshableUser({ userId }: { userId: string }) {
  const { data, refetch, isFetching } = getUser.use({ urlParams: { userId } })

  return (
    <div>
      <div>{data?.name}</div>
      <button onClick={() => refetch()} disabled={isFetching}>
        {isFetching ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  )
}
```

From anywhere else, invalidate through the query:

```typescript
const queryClient = useQueryClient()

await getUser.invalidate(queryClient, { urlParams: { userId } })
```

## WebSocket Integration

Apply pushed events to the cache with the typed helpers. Write the entry when the event carries the data, invalidate when it only says that something changed:

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

function useUserEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = new WebSocket('wss://api.example.com/events')

    socket.onmessage = (message) => {
      const event = JSON.parse(message.data)

      switch (event.type) {
        case 'user.updated': {
          // The event carries the new user: write it to the cache
          const user = userSchema.parse(event.user)
          getUser.setData(queryClient, { urlParams: { userId: user.id } }, user)
          void listUsers.invalidate(queryClient)
          break
        }
        case 'user.deleted':
          queryClient.removeQueries({
            queryKey: getUser.key({ urlParams: { userId: event.userId } }),
          })
          void listUsers.invalidate(queryClient)
          break
      }
    }

    return () => socket.close()
  }, [queryClient])
}
```

`@navios/builder` also provides typed WebSocket and EventSource builders; see [WebSocket](/docs/builder/builder/advanced/websocket) and [EventSource](/docs/builder/builder/advanced/eventsource).

## Appending to a List

```typescript
socket.onmessage = (message) => {
  const notification = notificationSchema.parse(JSON.parse(message.data))

  listNotifications.setData(queryClient, {}, (current) =>
    current ? [notification, ...current] : current,
  )
}
```

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries) - Query options
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Invalidation scopes
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Building keys
