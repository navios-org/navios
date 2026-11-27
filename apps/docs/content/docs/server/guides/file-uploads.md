---
title: File uploads
---

# File uploads

An endpoint declared with `body: 'multipart'` receives `multipart/form-data`, and answers any other body with 415. The handler is an ordinary `@Endpoint` handler: text fields arrive as strings and files as `File` objects in `data`, already validated by the declaration's `requestSchema`.

The declaration, and how a client fills it, belong to the Builder guide [File uploads](/docs/builder/guides/file-uploads). This page covers the server side.

## Receiving a file

```ts title="avatars.mts"
// The declaration from the Builder guide
export const uploadAvatar = API.declareEndpoint({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File), caption: z.string().optional() }),
  responseSchema: z.object({ url: z.string() }),
})
```

```ts title="avatars.controller.mts"
import { Controller, Endpoint, inject } from '@navios/server'

import type { HandlerParams } from '@navios/server'

import { uploadAvatar } from './avatars.mjs'
import { AvatarStorage } from './avatar-storage.service.mjs'

@Controller()
export class AvatarController {
  private readonly storage = inject(AvatarStorage)

  @Endpoint(uploadAvatar)
  async upload({ urlParams, data }: HandlerParams<typeof uploadAvatar>) {
    return { url: await this.storage.save(urlParams.userId, data.file) }
  }
}
```

`data.file` is a web `File`: `name`, `type`, `size`, and `arrayBuffer()`, `text()` or `stream()` for its content. Its name is the last part of the name that the client sent, on every adapter: `../../etc/passwd` arrives as `passwd`, and `..` as an empty name. What you do with it is up to a service:

```ts title="avatar-storage.service.mts"
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Injectable } from '@navios/server'

@Injectable()
export class AvatarStorage {
  private readonly dir = process.env.UPLOAD_DIR ?? './uploads'

  async save(userId: string, file: File) {
    await mkdir(this.dir, { recursive: true })
    const name = `${userId}-${crypto.randomUUID()}`
    await writeFile(join(this.dir, name), Buffer.from(await file.arrayBuffer()))
    return `/avatars/${name}`
  }
}
```

:::warning
`file.name` and `file.type` are chosen by the client. The name is never a path, but two clients may send the same one: do not store a file under it. Do not treat the type as proof of the content.
:::

## Enabling multipart

| Adapter | What is needed                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------- |
| Fastify | `defineFastifyEnvironment({ multipart: true })`, or its options object. Without it `init()` throws for an endpoint declared with `body: 'multipart'` |
| Bun     | Nothing                                                                                                 |

The option and its limits are described on the [Fastify](/docs/server/adapters/fastify) and [Bun](/docs/server/adapters/bun) adapter pages.

## How parts become `data`

The adapter collects the parts into one object, and `requestSchema` validates that object.

- A file part becomes a `File`. Every other part is a string.
- Several parts with the same name become an array.
- When the schema can describe itself as JSON Schema (Zod 4 and ArkType can), text takes the form the schema describes, by the [rules for all fields that are sent as text](/docs/server/essentials/controllers#text-that-stands-for-something-else): a field declared as an array is an array even when one part was sent or none, and a field declared as a number, a boolean or an object is one.
- With a schema library that cannot, such as Valibot, a single part stays a single value, and a text value that starts with `{` or `[` is parsed as JSON when possible. Describe the text in such a schema.

So this declaration accepts one or many files under `files`, and a client that sends a single `tags` part still gives the handler an array:

```ts
export const uploadAttachments = API.declareEndpoint({
  method: 'POST',
  url: '/posts/$postId/attachments',
  body: 'multipart',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)).min(1).max(10),
    tags: z.array(z.string()).optional(),
    position: z.number().optional(),
  }),
  responseSchema: z.object({ ids: z.array(z.string()) }),
})
```

## Limits

Every adapter reads every file into memory before the handler runs, so an upload endpoint needs two limits.

**In the schema**, for what a valid upload is. A file that fails it is a 400 validation response with `source: 'body'`, like any other invalid body:

```ts
const imageSchema = z
  .instanceof(File)
  .refine((file) => file.size <= 5 * 1024 * 1024, 'File must be 5 MB or smaller')
  .refine((file) => file.type.startsWith('image/'), 'File must be an image')
```

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed for body",
  "source": "body",
  "errors": [{ "path": "file", "message": "File must be an image" }]
}
```

The schema runs after the body has been received, so it does not protect the server's memory.

**In the adapter**, for how much the server is willing to read at all: `bodyLimit` and `multipart.limits` on Fastify and `serve.maxRequestBodySize` on Bun. Set them a little above the largest upload any schema allows. A request over the limit is answered with a 413 problem response. See the adapter pages linked above.

Guards run before the body is read. An upload from a caller who is not allowed to upload is rejected without reading the file.

For files too large to hold in memory, do not send them through the application: have the handler issue a pre-signed URL for your object storage and let the client upload there.

## Testing an upload

The test client encodes `data` as a client of the builder does. It is parsed again on every adapter, the in-memory one included:

```ts
const call = createTestClient(app)

const response = await call(uploadAvatar, {
  urlParams: { userId: '42' },
  data: { file: new File(['fake'], 'me.png', { type: 'image/png' }), caption: 'Me' },
})

expect(response.status).toBe(200)
```

`app.inject()` takes a `FormData` as its body. Both are described in [Testing](/docs/server/essentials/testing).
