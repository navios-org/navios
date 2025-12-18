# Navios Builder

`Navios Builder` is a helper library on top of `zod` to provide a more declarative way to create an API client with type safety and validation. It allows you to define your API endpoints, request and response schemas, and automatically generates the necessary code to make API requests.

## Why?

- **Type Safety**: By using Zod schemas, you can ensure that the data you receive from your API matches the expected structure. This helps catch errors early in the development process.
- **Validation**: Zod provides powerful validation capabilities, allowing you to define complex validation rules for your data. This ensures that the data you work with is always valid and meets your requirements.
- **Integration with @navios/http**: @navios/http is a powerful HTTP client that simplifies API requests. By combining it with Zod, you can create a robust and type-safe API client.
- **Declarative API**: The API is designed to be declarative, allowing you to define your API endpoints and their schemas in a clear and concise manner. This makes it easy to understand and maintain your API client.
- **Discriminated Union Support**: The package supports discriminated unions, allowing you to handle different response types based on a common property. This is useful for APIs that return different data structures based on the request.
- **Customizable**: The package allows you to customize the behavior of the API client, such as using a custom client.
- **Error Handling**: The package provides built-in error handling capabilities, allowing you to handle API errors gracefully and provide meaningful feedback to users.

## Installation

```bash
npm install --save @navios/builder zod
```

or

```bash
yarn add @navios/builder zod
```

## Usage

```ts
import { create } from '@navios/http'
import { builder } from '@navios/builder'
import { z } from 'zod/v4'

// or
import { create } from 'axios'

const API = builder({
  useDiscriminatorResponse: true,
})

const client = create({
  baseURL: 'https://example.com/api/',
})

// We can provide the client to the API
API.provideClient(client)

const GetUserResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const getUser = API.declareEndpoint({
  method: 'get',
  url: 'user',
  responseSchema: GetUserResponseSchema,
})
```

Or a more complex example with the request schema:

```ts
import { builder } from '@navios/builder'

import { z } from 'zod/v4'

import { GetUsersResponseSchema } from './schemas/GetUsersResponseSchema.js'

const API = builder({
  useDiscriminatorResponse: true,
})

const UpdateUserRequestSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const UpdateUserResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: GetUsersResponseSchema,
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
  }),
])

const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: 'user/$userId',
  requestSchema: UpdateUserRequestSchema,
  responseSchema: UpdateUserResponseSchema,
})

// In another file you can set the API client

// Use @navios/http client or axios
const client = create({
  baseURL: 'https://example.com/api/',
  headers: {
    Authorization: 'Bearer token',
  },
})

API.provideClient(client)

// Usage

const result = await updateUser({
  urlParams: {
    userId: 1,
  },
  data: {
    id: 1,
    name: 'John Doe',
  },
})

if (result.status === 'success') {
  console.log(result.data)
} else {
  console.error(result.error)
}
```

## API

### `builder`

`builder` is a function that creates an API object. It accepts an object with the following properties:

- `useDiscriminatorResponse` - if `true`, the error response will be checked by the original responseSchema. Default is `false`.

The function returns an API object with the following methods:

#### `declareEndpoint` - creates an endpoint with the specified options.

```ts
declareEndpoint({
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
  url: string,
  responseSchema: z.ZodSchema<unknown>, // Required
  // optional
  requestSchema: z.ZodSchema<unknown>, // Only for POST, PUT, PATCH methods
  querySchema: z.ZodSchema<unknown>, // For query parameters
})
```

Returns a function that makes the HTTP request. The function accepts:
- `urlParams`: Object with URL parameter values (when URL contains `$paramName`)
- `data`: Request body data (when `requestSchema` is provided)
- `params`: Query parameters (when `querySchema` is provided)
- `headers`: Additional headers
- `signal`: AbortSignal for request cancellation

The function returns a Promise that resolves to the parsed response data (validated by `responseSchema`).

#### `declareStream` - creates a stream endpoint for downloading files.

```ts
declareStream({
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
  url: string,
  // optional
  requestSchema: z.ZodSchema<unknown>, // Only for POST, PUT, PATCH methods
  querySchema: z.ZodSchema<unknown>, // For query parameters
})
```

Returns a function that makes the HTTP request and returns a `Blob`.

#### `declareMultipart` - creates a multipart/form-data endpoint for file uploads.

```ts
declareMultipart({
  method: 'POST' | 'PUT' | 'PATCH',
  url: string,
  responseSchema: z.ZodSchema<unknown>, // Required
  // optional
  requestSchema: z.ZodSchema<unknown>, // Should include File instances
  querySchema: z.ZodSchema<unknown>, // For query parameters
})
```

Returns a function that automatically converts the request data to `FormData` and makes the HTTP request.

#### `provideClient` - sets the HTTP client for the API.

```ts
provideClient(client) // client is an instance of axios or @navios/http client
```

The client must implement the `Client` interface with a `request` method that accepts `AbstractRequestConfig` and returns `Promise<AbstractResponse<T>>`.

#### `getClient` - gets the current HTTP client.

```ts
getClient() // Returns the current client or throws NaviosError if not set
```
