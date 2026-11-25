---
title: Schemas
---

# Schemas

Schemas are how a declaration describes data. This page explains what Builder expects from a schema and what it does with one. It is not a guide to writing schemas; for that, use the documentation of your schema library.

## Any Standard Schema

Every schema slot — `requestSchema`, `querySchema`, `urlParamsSchema`, `responseSchema`, and the entries of `errorSchema` and `responses` — accepts any implementation of [Standard Schema](https://standardschema.dev) v1. Zod, Valibot and ArkType all implement it, and you pass their schemas as they are.

Builder does not import a schema library. These docs use Zod because it is the most common choice.

Slots are independent, so libraries can be mixed in one declaration:

```ts
import * as v from 'valibot'
import { z } from 'zod/v4'

export const renameUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId/name',
  requestSchema: v.object({ name: v.pipe(v.string(), v.minLength(1)) }), // Valibot
  responseSchema: userSchema, // Zod
})
```

Schemas that validate asynchronously are supported. A check of an endpoint runs once per call. The socket and EventSource builders, which deliver synchronously when they can, find out with the first message that a Zod 3 schema or a transform of Zod Mini is asynchronous, so that message is checked twice.

## Input and output types

A schema has two types: what it accepts and what it produces. They differ whenever the schema transforms a value or fills in a default.

```ts
const querySchema = z.object({
  page: z.number().default(1),
  ids: z.string().transform((ids) => ids.split(',')),
})
// input:  { page?: number; ids: string }
// output: { page: number; ids: string[] }
```

Builder uses each where it makes sense:

- **What you pass** (`urlParams`, `params`, `data`) is typed as the schema's input.
- **What is sent** is what you passed. The server that parses it gets the output: the `page` above is filled in there, and `ids` travels as a string. [What is sent](/docs/builder/essentials/inputs#what-is-sent) has the details, and the option that sends the output instead.
- **What you receive** (the result, `error.body`) is typed as the schema's output.

### Responses in a shared contract

A response is validated on both ends when a Navios server implements the declaration. The server sends the **output** of the schema, because that is what removes fields the contract does not mention, and the client parses that JSON as input. So a `responseSchema`, an `errorSchema` entry or an event's `payloadSchema` in a shared contract must accept its own output, as it arrives in JSON.

Most schemas do: objects, unions, defaults and checks, and conversions that take both forms, such as `z.coerce.date()`:

```ts
const eventSchema = z.object({
  id: z.string(),
  startsAt: z.coerce.date(), // accepts a Date on the server and an ISO string on the client
})
```

A transform that renames fields or changes a type does not: its output fails its input. Keep it out of the contract and apply it where the value is used.

An API you only call has no such rule, because the schema runs once. There a response schema is a good place for conversions:

```ts
const eventSchema = z
  .object({
    id: z.string(),
    starts_at: z.iso.datetime(),
  })
  .transform((event) => ({
    id: event.id,
    startsAt: new Date(event.starts_at),
  }))
```

### Naming the types

To name these types for any library, use the helpers Builder exports:

```ts
import type { InferSchemaInput, InferSchemaOutput } from '@navios/builder'

type Query = InferSchemaInput<typeof querySchema>
type ParsedQuery = InferSchemaOutput<typeof querySchema>
```

## Deriving request schemas

Most request schemas are a variation of the resource schema. Deriving them keeps the declarations in step when the resource changes.

```ts
// userSchema comes from the Quick start
const createUserSchema = userSchema.omit({ id: true })
const updateUserSchema = createUserSchema.partial()
```

How you derive depends on the library; this is Zod's API.

## What a function in a schema costs

Zod compiles a schema to fast code. One that holds a function of yours anywhere, in a `refine`, `superRefine`, `check`, `transform`, `preprocess`, `codec`, `stringbool` or `custom`, or behind `z.lazy`, is validated without it, because the function may be asynchronous. A list of 5,000 rows that takes 0.6 ms to validate takes about 3 ms with one `refine`. Built-in checks, formats, `coerce`, `trim`, defaults and `catch` cost nothing extra.

For a large list keep functions out of the schema and apply them to the result, or skip the validation with `validateResponse: false`.

## When validation fails

A rejected value always produces an `EndpointError` of kind `request-validation` or `response-validation`, with `issues` in a common shape, whatever the library:

```ts
interface SchemaIssue {
  readonly message: string
  readonly path?: readonly PropertyKey[]
}
```

They are plain data without the validated value, so they can be logged. What the library reported is on `error.cause`: the `ZodError` of a Zod schema, and the list of issues of any other.

## Writing a schema by hand

Standard Schema is a small interface, so a one-off validator does not need a library. Builder exports the interface as `Schema<Input, Output>`.

```ts
import type { Schema } from '@navios/builder'

const slugSchema: Schema<{ slug: string }> = {
  '~standard': {
    version: 1,
    vendor: 'my-app',
    validate: (value) => {
      const slug = (value as { slug?: unknown } | null)?.slug
      return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug)
        ? { value: { slug } }
        : { issues: [{ message: 'Expected a lower-case slug', path: ['slug'] }] }
    },
  },
}
```

## Where the library matters

Two features need more than the Standard Schema interface provides:

- The declaration-time check that `urlParamsSchema` keys match the URL needs to read the schema's keys. It runs for schemas that expose `.shape`, which Zod objects do. With other libraries a mismatch surfaces on the first call instead.
- A Navios server decodes query strings, URL parameters and form fields, and generates an OpenAPI document, from each schema as JSON Schema. Libraries that implement Standard JSON Schema, as Zod 4 does, provide it. See [OpenAPI](/docs/server/guides/openapi#schemas). The server itself validates with any Standard Schema library.
