# Complete Example

A small todo application showing queries, mutations, invalidation, optimistic updates and typed errors together.

## Setup

```typescript
// api/client.ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

export const api = builder({
  client: create({ baseURL: 'https://api.example.com' }),
  onError: (error) => {
    if (error.kind !== 'aborted') console.error(error.toJSON())
  },
})

export const client = declareClient({ api })
```

## Schemas

```typescript
// api/schemas.ts
import { z } from 'zod'

export const todoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
})

export const createTodoSchema = z.object({
  title: z.string().min(1),
})

export const updateTodoSchema = z.object({
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
})

export type Todo = z.output<typeof todoSchema>
```

## Queries

```typescript
// api/todos.ts
import { z } from 'zod'

import { client } from './client'
import { createTodoSchema, todoSchema, updateTodoSchema } from './schemas'

export const listTodos = client.query({
  method: 'GET',
  url: '/todos',
  responseSchema: z.array(todoSchema),
})

export const getTodo = client.query({
  method: 'GET',
  url: '/todos/$todoId',
  responseSchema: todoSchema,
  errorSchema: {
    404: z.object({ message: z.string() }),
  },
})
```

## Mutations

```typescript
// api/todos.ts (continued)
export const createTodo = client.mutation({
  method: 'POST',
  url: '/todos',
  requestSchema: createTodoSchema,
  responseSchema: todoSchema,
  errorSchema: {
    422: z.object({ message: z.string() }),
  },
  invalidates: [listTodos],
})

export const updateTodo = client.mutation({
  method: 'PATCH',
  url: '/todos/$todoId',
  requestSchema: updateTodoSchema,
  responseSchema: todoSchema,
  optimistic: (update) => [
    update(getTodo, {
      args: (variables) => ({ urlParams: variables.urlParams }),
      update: (current, variables) => current && { ...current, ...variables.data },
    }),
    update(listTodos, {
      update: (current, variables) =>
        current?.map((todo) =>
          todo.id === String(variables.urlParams.todoId) ? { ...todo, ...variables.data } : todo,
        ),
    }),
  ],
})

export const deleteTodo = client.mutation({
  method: 'DELETE',
  url: '/todos/$todoId',
  response: 'void',
  optimistic: (update) =>
    update(listTodos, {
      update: (current, variables) =>
        current?.filter((todo) => todo.id !== String(variables.urlParams.todoId)),
    }),
  onSuccess: (_data, variables, context) => {
    context.client.removeQueries({ queryKey: getTodo.key({ urlParams: variables.urlParams }) })
  },
})
```

## Components

```typescript
// components/TodoList.tsx
import { createTodo, deleteTodo, listTodos, updateTodo } from '../api/todos'

import type { Todo } from '../api/schemas'

export function TodoList() {
  const { data: todos } = listTodos.useSuspense()

  return (
    <div>
      <AddTodo />
      <ul>
        {todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} />
        ))}
      </ul>
    </div>
  )
}

function TodoItem({ todo }: { todo: Todo }) {
  const args = { urlParams: { todoId: todo.id } }
  const { mutate: update } = updateTodo()
  const { mutate: remove } = deleteTodo()
  const isDeleting = deleteTodo.useIsMutating(args)

  return (
    <li>
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => update({ ...args, data: { done: !todo.done } })}
      />
      <span>{todo.title}</span>
      <button onClick={() => remove(args)} disabled={isDeleting}>
        Delete
      </button>
    </li>
  )
}

function AddTodo() {
  const { mutate, isPending, error } = createTodo()

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const title = String(new FormData(form).get('title') ?? '')
    mutate({ data: { title } }, { onSuccess: () => form.reset() })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Add todo..." disabled={isPending} />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Adding...' : 'Add'}
      </button>
      {error && <p>{describe(error)}</p>}
    </form>
  )
}
```

The error of `createTodo` is typed from its `errorSchema`:

```typescript
import type { EndpointErrorType } from '@navios/builder'

function describe(error: EndpointErrorType<typeof createTodo.endpoint>): string {
  if (error.kind === 'http' && error.status === 422) return error.body.message
  if (error.kind === 'request-validation') return error.issues[0]?.message ?? 'Invalid input'
  if (error.kind === 'network') return 'You appear to be offline'
  return 'Something went wrong'
}
```

## App Setup

```typescript
// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

import { TodoList } from './components/TodoList'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Suspense fallback={<div>Loading...</div>}>
          <TodoList />
        </Suspense>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}
```

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries) - Learn about queries
- [Mutations](/docs/builder/react-query/guides/mutations) - Learn about mutations
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update UI optimistically
- [Form Handling](/docs/builder/react-query/recipes/form-handling) - Forms and server validation
