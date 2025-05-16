# Navios Schedule

`Navios Zod React` is a helper for a navios zod to use with Tanstack React Query.

## Why?

- **Type Safety**: By using Zod schemas, you can ensure that the data you receive from your API matches the expected structure. This helps catch errors early in the development process.
- **Validation**: Zod provides powerful validation capabilities, allowing you to define complex validation rules for your data. This ensures that the data you work with is always valid and meets your requirements.
- **Integration with Navios**: Navios is a powerful HTTP client that simplifies API requests. By combining it with Zod, you can create a robust and type-safe API client.
- **React Query Support**: This package is designed to work seamlessly with Tanstack React Query, making it easy to manage API requests and responses in your React applications.
- **Declarative API**: The API is designed to be declarative, allowing you to define your API endpoints and their schemas in a clear and concise manner. This makes it easy to understand and maintain your API client.
- **Discriminated Union Support**: The package supports discriminated unions, allowing you to handle different response types based on a common property. This is useful for APIs that return different data structures based on the request.
- **Customizable**: The package allows you to customize the behavior of the API client, such as using a custom Navios client or enabling/disabling certain features like whole response validation.
- **Error Handling**: The package provides built-in error handling capabilities, allowing you to handle API errors gracefully and provide meaningful feedback to users.

## Installation

```bash
npm install --save @navios/navios-zod @navios/navios-zod-react zod navios
```

or

```bash
yarn add @navios/navios-zod @navios/navios-zod-react zod navios
```

## Usage of Mutations

```tsx
import { createAPI } from '@navios/navios-zod'
import { declareClient } from '@navios/navios-zod-react'

import { z } from 'zod'

const publicApi = createAPI({
  baseURL: 'https://example.com/api/',
  useDiscriminatorResponse: true,
})

const publicClient = declareClient({
  api: publicApi,
})

const RequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(32),
})

const loginMutation = publicClient.mutation({
  url: 'auth/login',
  method: 'post',
  // Navios Zod also validates the request body
  requestSchema: RequestSchema,
  responseSchema: z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: z.object({
        accessToken: z.string(),
        refreshToken: z.string(),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.object({
        message: z.string(),
      }),
    }),
  ]),
  processResponse: (response) => {
    if (response.success) {
      return response.data
    } else {
      throw new Error(response.error.message)
    }
  },
})

export function Login() {
  const { mutateAsync: login, data, isSuccess, error } = loginMutation()

  const form = useForm({
    resolver: zodResolver(RequestSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  useEffect(() => {
    if (isSuccess) {
      console.log('Login successful:', data)
    }
  }, [isSuccess, data])

  return (
    <form onSubmit={form.handleSubmit(login)}>
      {error && <p>{error.message}</p>}
      <input {...form.register('email')} placeholder="Email" />
      <input
        {...form.register('password')}
        type="password"
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  )
}
```

## Usage of Queries

```tsx
import { createAPI } from '@navios/navios-zod'
import { declareClient } from '@navios/navios-zod-react'

import { z } from 'zod'

const publicApi = createAPI({
  baseURL: 'https://example.com/api/',
  useDiscriminatorResponse: true,
})

const publicClient = declareClient({
  api: publicApi,
})

const usersList = publicClient.query({
  url: 'users',
  method: 'GET',
  querySchema: z.object({
    page: z.number().optional().default(1),
    limit: z.number().optional().default(10),
  }),
  responseSchema: z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          email: z.string().email(),
        }),
      ),
    }),
    z.object({
      success: z.literal(false),
      error: z.object({
        message: z.string(),
      }),
    }),
  ]),
  processResponse: (response) => {
    if (response.success) {
      return response.data
    } else {
      throw new Error(response.error.message)
    }
  },
})

export function UsersList() {
  const { page, limit } = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const { data, isLoading, error } = usersList.use({
    params: {
      page,
      limit,
    },
  })

  if (isLoading) {
    return <p>Loading...</p>
  }

  if (error) {
    return <p>{error.message}</p>
  }

  return <ul>{data?.map((user) => <li key={user.id}>{user.name}</li>)}</ul>
}
```

## Usage of Infinite Queries

```tsx
import { createAPI } from '@navios/navios-zod'
import { declareClient } from '@navios/navios-zod-react'

import { z } from 'zod'

const publicApi = createAPI({
  baseURL: 'https://example.com/api/',
  useDiscriminatorResponse: true,
})

const publicClient = declareClient({
  api: publicApi,
})

const usersList = publicClient.infiniteQuery({
  url: 'users',
  method: 'GET',
  querySchema: z.object({
    page: z.number().optional().default(1),
    limit: z.number().optional().default(10),
  }),
  responseSchema: z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          email: z.string().email(),
        }),
      ),
      meta: z.object({
        total: z.number(),
        totalPages: z.number(),
        page: z.number(),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.object({
        message: z.string(),
      }),
    }),
  ]),
  processResponse: (response) => {
    if (response.success) {
      return response.data
    } else {
      throw new Error(response.error.message)
    }
  },
  getNextPageParam: (lastPage, pages) => {
    if (lastPage.meta.page < lastPage.meta.totalPages) {
      return lastPage.meta.page + 1
    }
    return undefined
  },
  select: (data) => {
    return data.pages.flatMap((page) => page.data)
  },
})

export function UsersList() {
  const { page, limit } = routeApi.useSearch()
  const { data, isLoading, error, fetchNextPage, hasNextPage } = usersList.use({
    params: {
      page,
      limit,
    },
  })

  if (isLoading) {
    return <p>Loading...</p>
  }

  if (error) {
    return <p>{error.message}</p>
  }

  return (
    <div>
      <ul>
        {data?.map((page) =>
          page.data.map((user) => <li key={user.id}>{user.name}</li>),
        )}
      </ul>
      <button disabled={!hasNextPage} onClick={() => fetchNextPage()}>
        Load more
      </button>
    </div>
  )
}
```

## API

### `declareClient`

This function is used to create a client for the API. It takes an object with the following properties:

- `api`: The API object created using `declareAPI` or `createAPI` from `@navios/navios-zod`.

The client object will have the following properties:

- `query`: A function that takes a configuration object and returns a query object.
- `mutation`: A function that takes a configuration object and returns a mutation object.
- `infiniteQuery`: A function that takes a configuration object and returns an infinite query object.

#### `query`

This function is used to create a query for the API. It takes a configuration object with the following properties:

- `url`: The URL of the API endpoint. For parameterized URLs, use the format `/users/$userId`.
- `method`: The HTTP method to use (GET, POST, PUT, DELETE, etc.).
- `querySchema`: A Zod schema for validating the query parameters. (optional)
- `responseSchema`: A Zod schema for validating the response data.
- `processResponse`: A function that takes the response data and returns the processed data. (optional, but recommended)

The result is a function that can be used to get query options. The function takes an object with the following properties:

- `params`: An object with the query parameters to send with the request. (required if `querySchema` is defined)
- `urlParams`: An object with the URL parameters to send with the request. (required if `url` contains URL parameters)

Function returns options for `useQuery` or `useSuspenseQuery` from `@tanstack/react-query`.

##### `queryName.use`

This function is a helper hook which is a wrapper around `useQuery` from `@tanstack/react-query`. It takes the same parameters as the `query` result function and returns the query result.

##### `queryName.useSuspense`

This function is a helper hook which is a wrapper around `useSuspenseQuery` from `@tanstack/react-query`. It takes the same parameters as the `query` result function and returns the query result.

##### `queryName.invalidate`

This function is a helper function which is a wrapper around `invalidateQueries` from `@tanstack/react-query`. It takes parameters:

- `queryClient`: The query client to use. (optional, defaults to the query client from the context)
- `params`: An object with `urlParams` and `params` to invalidate the query. (required if `url` contains URL parameters or `querySchema` is defined)

This function is used to invalidate the query in the cache. It can be used to refetch the query data when the data changes or when the user navigates to a different page.

##### `queryName.invalidateAll`

This function is a helper function which is a wrapper around `invalidateQueries` from `@tanstack/react-query`. It takes parameters:

- `queryClient`: The query client to use. (optional, defaults to the query client from the context)
- `params`: An object with `urlParams` to invalidate the query. (required if `url` contains URL parameters)

This function is used to invalidate query ignoring query params. It can be used to refetch all query data when the data changes or when the user navigates to a different page.

#### `mutation`

This function is used to create a mutation for the API. It takes a configuration object with the following properties:

- `url`: The URL of the API endpoint. For parameterized URLs, use the format `/users/$userId`.
- `method`: The HTTP method to use (PATCH, POST, PUT, DELETE, etc.).
- `requestSchema`: A Zod schema for validating the request body.
- `responseSchema`: A Zod schema for validating the response data.
- `processResponse`: A function that takes the response data and returns the processed data. (optional, but recommended)
- `useContext`: A function that is called before the mutation is executed. It can be used to set the context for the onSuccess and onError. (optional)
- `onSuccess`: A function that is called when the mutation is successful. (optional)
- `onError`: A function that is called when the mutation fails. (optional)
- `useKey`: If true, the mutation will have a mutation key which can be used to get the mutation status, limit parallel requests, etc. (optional, defaults to false)

The result is a function that can be used to get mutation in react query. When `useKey` is true, the function requires a `urlParams` argument.

The result is a react query mutation object

#### `infiniteQuery`

This function is used to create an infinite query for the API. It takes a configuration object with the following properties:

- `url`: The URL of the API endpoint. For parameterized URLs, use the format `/users/$userId`.
- `method`: The HTTP method to use (GET, POST, PUT, DELETE, etc.).
- `querySchema`: A Zod schema for validating the query parameters. (required)
- `responseSchema`: A Zod schema for validating the response data.
- `processResponse`: A function that takes the response data and returns the processed data. (optional, but recommended)
- `getNextPageParam`: A function that takes the last page and all pages and returns the next page param. (required)
- `initialPageData`: The initial data to use for the first page. (optional)
- `getPreviousPageParam`: A function that takes the first page and all pages and returns the previous page param. (optional)
- `select`: A function that takes the data and returns the selected data. (optional)

It works the same as `query`, but it returns an infinite query object. Please refer to the `query` section for more details.
