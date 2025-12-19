---
sidebar_position: 2
---

# Query Client Configuration

Configure default options for all queries and mutations when creating the React Query client.

## Default Options

Set default options when creating `declareClient`:

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', 'v1'],
    keySuffix: ['cache'],
  },
})
```

## Key Prefix

Add a prefix to all query keys:

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', 'v1'],
  },
})

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Key: ['api', 'v1', 'users', '123']
const key = getUser.queryKey.dataTag({ urlParams: { userId: '123' } })
```

## Key Suffix

Add a suffix to all query keys:

```typescript
const client = declareClient({
  api,
  defaults: {
    keySuffix: ['cache'],
  },
})

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Key: ['users', '123', 'cache']
const key = getUser.queryKey.dataTag({ urlParams: { userId: '123' } })
```

## Combined Prefix and Suffix

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', 'v1'],
    keySuffix: ['cache'],
  },
})

// Key: ['api', 'v1', 'users', '123', 'cache']
```

## Use Cases

### API Versioning

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', 'v2'],
  },
})
```

### Environment Isolation

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', process.env.NODE_ENV],
  },
})
```

### Cache Namespacing

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['app', 'cache'],
    keySuffix: ['v1'],
  },
})
```

## Next Steps

- [Query Keys](/docs/builder/react-query/guides/query-keys) - Understand query key structure
- [Getting Started](/docs/builder/react-query/getting-started) - Basic setup

