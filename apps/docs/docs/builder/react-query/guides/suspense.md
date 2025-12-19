---
sidebar_position: 8
---

# Suspense

Suspense provides a cleaner API for handling loading states by throwing promises that Suspense boundaries can catch. Builder's React Query integration provides first-class Suspense support.

## Basic Usage

Use `useSuspense` instead of `use`:

```typescript
function UserProfile({ userId }: { userId: string }) {
  // useSuspense throws on loading/error, so Suspense/ErrorBoundary handles it
  const user = getUser.useSuspense({ urlParams: { userId } })
  
  // No loading/error checks needed!
  return <div>{user.name}</div>
}

function App() {
  return (
    <ErrorBoundary fallback={<div>Error!</div>}>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile userId="123" />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## Suspense Boundaries

Wrap components using `useSuspense` in Suspense boundaries:

```typescript
function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UserProfile userId="123" />
    </Suspense>
  )
}
```

## Error Boundaries

Use ErrorBoundary to catch errors:

```typescript
class QueryErrorBoundary extends React.Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <div>Error: {this.state.error.message}</div>
    }
    return this.props.children
  }
}

function App() {
  return (
    <QueryErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile userId="123" />
      </Suspense>
    </QueryErrorBoundary>
  )
}
```

## Multiple Queries

Multiple queries in the same component:

```typescript
function UserDashboard({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })
  const posts = getUserPosts.useSuspense({ urlParams: { userId } })
  const comments = getUserComments.useSuspense({ urlParams: { userId } })

  // All queries suspend until ready
  return (
    <div>
      <h1>{user.name}</h1>
      <PostsList posts={posts} />
      <CommentsList comments={comments} />
    </div>
  )
}
```

## Nested Suspense

Use nested Suspense boundaries for granular loading states:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })

  return (
    <div>
      <h1>{user.name}</h1>
      <Suspense fallback={<div>Loading posts...</div>}>
        <UserPosts userId={userId} />
      </Suspense>
    </div>
  )
}

function UserPosts({ userId }: { userId: string }) {
  const posts = getUserPosts.useSuspense({ urlParams: { userId } })
  return <div>{/* ... */}</div>
}
```

## Infinite Queries with Suspense

```typescript
function InfiniteUserList() {
  const data = getUsers.useSuspense({ params: { limit: 20 } })

  return (
    <div>
      {data.pages.flatMap((page) =>
        page.users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))
      )}
    </div>
  )
}
```

## Conditional Suspense

Use `enabled` to conditionally suspend:

```typescript
function UserProfile({ userId }: { userId?: string }) {
  if (!userId) {
    return <div>No user selected</div>
  }

  // Only suspends if userId exists
  const user = getUser.useSuspense({
    urlParams: { userId },
    enabled: !!userId,
  })

  return <div>{user.name}</div>
}
```

## Loading States

Suspense handles loading automatically:

```typescript
// ❌ Not needed with Suspense
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading } = getUser.use({ urlParams: { userId } })
  if (isLoading) return <div>Loading...</div>
  return <div>{data.name}</div>
}

// ✅ Cleaner with Suspense
function UserProfile({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })
  return <div>{user.name}</div>
}
```

## Error Handling

ErrorBoundary handles errors:

```typescript
// ❌ Manual error handling
function UserProfile({ userId }: { userId: string }) {
  const { data, error, isError } = getUser.use({ urlParams: { userId } })
  if (isError) return <div>Error: {error.message}</div>
  return <div>{data.name}</div>
}

// ✅ ErrorBoundary handles it
function UserProfile({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })
  return <div>{user.name}</div>
}
```

## Best Practices

### Use Suspense for Cleaner Code

```typescript
// ✅ Good - cleaner with Suspense
function UserProfile({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })
  return <div>{user.name}</div>
}

// ❌ More verbose without Suspense
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = getUser.use({ urlParams: { userId } })
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  return <div>{data.name}</div>
}
```

### Provide Meaningful Fallbacks

```typescript
// ✅ Good - specific fallback
<Suspense fallback={<UserProfileSkeleton />}>
  <UserProfile userId="123" />
</Suspense>

// ❌ Bad - generic fallback
<Suspense fallback={<div>Loading...</div>}>
  <UserProfile userId="123" />
</Suspense>
```

### Use ErrorBoundary

```typescript
// ✅ Good - error handling
<ErrorBoundary fallback={<ErrorDisplay />}>
  <Suspense fallback={<LoadingSpinner />}>
    <UserProfile userId="123" />
  </Suspense>
</ErrorBoundary>
```

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries) - Learn about queries
- [Error Handling](/docs/builder/react-query/guides/queries#error-handling) - More error handling patterns
- [Best Practices](/docs/builder/react-query/best-practices) - More Suspense patterns

