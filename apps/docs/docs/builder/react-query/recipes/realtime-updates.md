---
sidebar_position: 3
---

# Real-time Updates

Patterns for keeping data fresh with polling, refetching, and WebSocket integration.

## Polling

Refetch queries at regular intervals:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const { data } = getUser.use({
    urlParams: { userId },
    refetchInterval: 5000, // Refetch every 5 seconds
  })

  return <div>{data.name}</div>
}
```

## Conditional Polling

Poll only when certain conditions are met:

```typescript
function UserProfile({ userId, isActive }: { userId: string; isActive: boolean }) {
  const { data } = getUser.use({
    urlParams: { userId },
    refetchInterval: isActive ? 5000 : false, // Only poll when active
  })

  return <div>{data.name}</div>
}
```

## Refetch on Window Focus

Automatically refetch when window regains focus:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const { data } = getUser.use({
    urlParams: { userId },
    refetchOnWindowFocus: true,
  })

  return <div>{data.name}</div>
}
```

## Manual Refetch

Refetch manually with a button:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const { data, refetch, isRefetching } = getUser.use({
    urlParams: { userId },
  })

  return (
    <div>
      <div>{data.name}</div>
      <button onClick={() => refetch()} disabled={isRefetching}>
        {isRefetching ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  )
}
```

## Refetch on Interval with Condition

Refetch at intervals, but only if data is stale:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const { data } = getUser.use({
    urlParams: { userId },
    refetchInterval: (query) => {
      // Only refetch if data is stale
      return query.state.dataUpdatedAt < Date.now() - 30000 ? 5000 : false
    },
  })

  return <div>{data.name}</div>
}
```

## WebSocket Integration

Integrate with WebSocket for real-time updates:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const ws = new WebSocket(`wss://api.example.com/users/${userId}`)

    ws.onmessage = (event) => {
      const updatedUser = JSON.parse(event.data)
      // Update cache when WebSocket message received
      queryClient.setQueryData(
        getUser.queryKey.dataTag({ urlParams: { userId } }),
        updatedUser
      )
    }

    return () => {
      ws.close()
    }
  }, [userId, queryClient])

  const user = getUser.useSuspense({ urlParams: { userId } })
  return <div>{user.name}</div>
}
```

## Invalidate on Interval

Invalidate queries at regular intervals:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const interval = setInterval(() => {
      getUser.invalidate(queryClient, {
        urlParams: { userId },
      })
    }, 30000) // Every 30 seconds

    return () => clearInterval(interval)
  }, [userId, queryClient])

  const user = getUser.useSuspense({ urlParams: { userId } })
  return <div>{user.name}</div>
}
```

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries) - Learn about queries
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Cache invalidation

