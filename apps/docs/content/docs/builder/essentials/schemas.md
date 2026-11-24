---
title: Schemas
---

# Schemas

Schemas are how a declaration describes data. This page explains what Builder expects from a schema and what it does with one. It is not a guide to writing schemas; for that, use the documentation of your schema library.

## Any Standard Schema

Every schema slot — `requestSchema`, `querySchema`, `urlParamsSchema`, `responseSchema`, and the entries of `errorSchema` and `responses` — accepts any implementation of [Standard Schema](https://standardschema.dev) v1. Zod, Valibot and ArkType all implement it, and you pass their schemas as they are.

Builder does not import a schema library. These docs use Zod because it is the most common choice, and `zod` is an optional peer dependency.

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

Schemas that validate asynchronously are supported.

## Input and output types

A schema has two types: what it accepts and what it produces. They differ whenever the schema transforms a value or fills in a default.

```ts
const querySchema = z.object({
  page: z.number().default(1),
  since: z.date().transform((date) => date.toISOString()),
})
// input:  { page?: number; since: Date }
// output: { page: number; since: string }
```

Builder uses each where it makes sense:

- **What you pass** (`urlParams`, `params`, `data`) is typed as the schema's input.
- **What you receive** (the result, `error.body`) is typed as the schema's output.
- **What is sent** is the output of the request-side schemas, so the `since` above travels as a string.

This makes schemas the place for wire-format conversions. Parsing an ISO string into a `Date` on the way in, or renaming a field, is a transform on the response schema:

```ts
const eventSchema = z.object({
  id: z.string(),
  starts_at: z.iso.datetime(),
}).transform((event) => ({
  id: event.id,
  startsAt: new Date(event.starts_at),
}))
```

To name these types for any library, use the helpers Builder exports:

```ts
import type { InferSchemaInput, InferSchemaOutput } from '@navios/builder'

type Query = InferSchemaInput<typeof querySchema>
type SentQuery = InferSchemaOutput<typeof querySchema>
```

## Deriving request schemas

Most request schemas are a variation of the resource schema. Deriving them keeps the declarations in step when the resource changes.

```ts
// userSchema comes from the Quick start
const createUserSchema = userSchema.omit({ id: true })
const updateUserSchema = createUserSchema.partial()
```

How you derive depends on the library; this is Zod's API.

## When validation fails

A rejected value always produces an `EndpointError` of kind `request-validation` or `response-validation`, with `issues` in a common shape:

```ts
interface SchemaIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
}
```

For a Zod schema, `error.cause` is the original `ZodError`, so library-specific details remain available. For other libraries `cause` is `undefined` and `issues` is the full report.

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
- Declarations shared with a Navios server have their own requirements. See [Sharing with Navios Server](/docs/builder/guides/navios-server#schema-libraries-on-the-server).
