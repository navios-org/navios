# Navios Builder

`Navios Builder` is a helper library on top of `zod` to provide a more declarative way to create an API client with type safety and validation. It allows you to define your API endpoints, request and response schemas, and automatically generates the necessary code to make API requests.

## Why?

- **Type Safety**: By using Zod schemas, you can ensure that the data you receive from your API matches the expected structure. This helps catch errors early in the development process.
- **Validation**: Zod provides powerful validation capabilities, allowing you to define complex validation rules for your data. This ensures that the data you work with is always valid and meets your requirements.
- **Integration with Navios**: Navios is a powerful HTTP client that simplifies API requests. By combining it with Zod, you can create a robust and type-safe API client.
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
import { builder } from '@navios/builder'
import { create } from 'navios'
// or
import { create } from 'axios'

import { z } from 'zod'

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

import { z } from 'zod'

import { GetUsersResponseSchema } from './schemas/GetUsersResponseSchema.js'

const API = builder({
  useDiscriminatorResponse: true,
  useWholeResponse: true,
})

const UpdateUserRequestSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const UpdateUserResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal(200),
    data: GetUsersResponseSchema,
  }),
  z.object({
    status: z.literal(400),
    data: z.object({
      error: z.string(),
    }),
  }),
])

const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: 'user/$userId',
  requestSchema: UpdateUserRequestSchema,
  responseSchema: UpdateUserResponseSchema,
})

// In another file you can set the API client

// Use navios client or axios
const client = create({
  baseURL: 'https://example.com/api/',
  headers: {
    Authorization: 'Bearer token',
  },
})

API.provideClient(client)

// Usage

const { data: updatedUserOrError, status } = await updateUser({
  urlParams: {
    userId: 1,
  },
  data: {
    id: 1,
    name: 'John Doe',
  },
})

if (status === 200) {
  console.log(updatedUserOrError)
} else {
  console.error(updatedUserOrError)
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
  method: 'get' | 'post' | 'put' | 'delete' | 'patch',
  url: string,
  // optional
  requestSchema: z.ZodSchema<unknown>, // Only for POST, PUT, PATCH methods
  responseSchema: z.ZodSchema<unknown>,
  // optional
  querySchema: z.ZodSchema<unknown>,
})
```

#### `provideClient` - sets the client for the API.

```ts
provideClient(client) // client is an instance of axios or navios client
```
