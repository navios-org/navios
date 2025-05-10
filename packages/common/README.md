# Navios Common

`Navios Common` is a simple wrapper around `zod` library to provide a more convenient way to work with `zod` schemas.

## Why?

Developers forget to use `zod` to check the data before using it. This can lead to unexpected errors in the application. `Navios Zod` provides a simple way to check the data before using it.

You cannot trust that API will return the data in the format you expect. `Navios Zod` provides a simple way to check the data before using it.

## Installation

```bash
npm install --save @navios/navios-zod zod navios
```

or

```bash
yarn add @navios/navios-zod zod navios
```

## Usage

```ts
import { createAPI } from '@navios/navios-zod'

import { z } from 'zod'

const API = createAPI({
  baseURL: 'https://example.com/api/',
})

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

Or more complex example with request schema:

```ts
import { declareAPI } from '@navios/navios-zod'

import { z } from 'zod'

import { GetUsersResponseSchema } from './schemas/GetUsersResponseSchema.js'

const API = declareAPI({
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

### `declareAPI`

`declareAPI` is a function that creates an API object. It accepts an object with the following properties:

- `useDiscriminatorResponse` - if `true`, the error response will be checked by the original responseSchema. Default is `false`.
- `useWholeResponse` - if `true`, the whole response will be checked. Default is `false`.

The function returns an API object with the following methods:

#### `declareEndpoint` - creates an endpoint with the specified options.

```ts
declareEndpoint({
  method: 'get' | 'post' | 'put' | 'delete' | 'patch',
  url: string,
  requestSchema?: z.ZodSchema<unknown>, // Only for POST, PUT, PATCH methods
  responseSchema: z.ZodSchema<unknown>,
  querySchema?: z.ZodSchema<unknown>,
})
```

#### `provideClient` - sets the client for the API.

```ts
provideClient(client: Navios)
```

### `createAPI`

`createAPI` is a wrapper around `declareAPI` that creates an API object with default navios client.

```ts
const API = createAPI({
  baseURL: string,
  useDiscriminatorResponse?: boolean,
  useWholeResponse?: boolean,
})
```

The function returns an API object with the same methods as `declareAPI`.
