---
sidebar_position: 2
title: Multipart Uploads
---

# Multipart Uploads

Handle file uploads using the `@Multipart()` decorator for processing multipart/form-data requests.

## Enabling Multipart

### Fastify Adapter

For Fastify, enable multipart support using `@fastify/multipart`:

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

app.enableMultipart({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5, // Max 5 files
  },
})
```

### Bun Adapter

Bun natively supports multipart form data - no additional configuration needed. Just use `@Multipart()` endpoints directly.

## Defining Upload Endpoints

Declare the endpoint with `body: 'multipart'` in `@navios/builder`:

```typescript
import { builder } from '@navios/builder'

import { z } from 'zod'

const API = builder()

const uploadFile = API.declareEndpoint({
  method: 'POST',
  url: '/files/upload',
  body: 'multipart',
  responseSchema: z.object({
    fileId: z.string(),
    filename: z.string(),
    size: z.number(),
  }),
})
```

:::warning
`body: 'multipart'` is required. `@Multipart()` rejects a declaration without it, at compile time and with an error at startup, because the client would send JSON to a handler that expects form data. See [Matching Decorators and Declarations](/docs/server/guides/controllers#matching-decorators-and-declarations).
:::

## Handling Uploads

Use `@Multipart()` and `MultipartParams`:

```typescript
import { Controller, Multipart, MultipartParams } from '@navios/core'

@Controller()
class FileController {
  @Multipart(uploadFile)
  async upload(params: MultipartParams<typeof uploadFile>) {
    const file = params.file

    // file.filename - Original filename
    // file.mimetype - MIME type
    // file.toBuffer() - Get file contents as Buffer

    const buffer = await file.toBuffer()
    const fileId = await this.storageService.save(buffer, file.filename)

    return {
      fileId,
      filename: file.filename,
      size: buffer.length,
    }
  }
}
```

## Responses

On the response side `@Multipart()` accepts exactly what `@Endpoint()` accepts. Only the request body differs.

| Declaration                | The method returns                          | Status                               |
| -------------------------- | ------------------------------------------- | ------------------------------------ |
| `responseSchema`           | the response body                           | 200, or the one set by `@HttpCode()` |
| `response: 'void'`         | nothing                                     | 204, or the one set by `@HttpCode()` |
| `responses: { status: … }` | `reply(status, body)` for a declared status | the one passed to `reply()`          |

### Uploads Without a Response Body

Declare `response: 'void'` when there is nothing to send back. The reply is **204 No Content** with an empty body:

```typescript
const uploadAvatar = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId/avatar',
  body: 'multipart',
  response: 'void',
  requestSchema: z.object({ file: z.instanceof(File) }),
})

@Controller()
class UserController {
  @Multipart(uploadAvatar)
  async uploadAvatar(params: MultipartParams<typeof uploadAvatar>) {
    await this.avatars.save(params.urlParams.userId, params.data.file)
  }
}
```

`@HttpCode()` still overrides the status, for example `@HttpCode(202)` for an upload that is processed later.

### Uploads With a Response per Status

Declare a `responses` map instead of `responseSchema` and pick the status with `reply(status, body)`. The body is validated with the schema of that status, and a `null` entry has no body:

```typescript
import { Controller, Multipart, reply } from '@navios/core'

import type { MultipartParams } from '@navios/core'

const importUsers = API.declareEndpoint({
  method: 'POST',
  url: '/users/import',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responses: {
    201: z.object({ imported: z.number() }),
    204: null,
  },
})

@Controller()
class UserController {
  @Multipart(importUsers)
  async importUsers(params: MultipartParams<typeof importUsers>) {
    const imported = await this.users.import(params.data.file)
    return imported === 0 ? reply(204) : reply(201, { imported })
  }
}
```

`@HttpCode()` cannot be combined with a `responses` map: the status comes from `reply()`, and applying both throws at startup. Returning anything but a `reply()` for a declared status is a compile error, and a 500 at runtime.

:::note
`response: 'blob'`, `'text'` and `'stream'` are not served by `@Multipart()`: such a declaration is rejected at compile time and with an error at startup.
:::

## Multiple Files

Handle multiple file uploads:

```typescript
const uploadMultiple = API.declareEndpoint({
  method: 'POST',
  url: '/files/batch',
  body: 'multipart',
  responseSchema: z.array(
    z.object({
      fileId: z.string(),
      filename: z.string(),
    }),
  ),
})

@Controller()
class FileController {
  @Multipart(uploadMultiple)
  async uploadBatch(params: MultipartParams<typeof uploadMultiple>) {
    const results = []

    for await (const file of params.files) {
      const buffer = await file.toBuffer()
      const fileId = await this.storageService.save(buffer, file.filename)
      results.push({ fileId, filename: file.filename })
    }

    return results
  }
}
```

## With Form Fields

Combine file uploads with form data:

```typescript
const createPost = API.declareEndpoint({
  method: 'POST',
  url: '/posts',
  body: 'multipart',
  requestSchema: z.object({
    title: z.string(),
    content: z.string(),
  }),
  responseSchema: postSchema,
})

@Controller()
class PostController {
  @Multipart(createPost)
  async createPost(params: MultipartParams<typeof createPost>) {
    const { title, content } = params.data
    const image = params.file

    let imageUrl = null
    if (image) {
      const buffer = await image.toBuffer()
      imageUrl = await this.storageService.upload(buffer)
    }

    return this.postService.create({
      title,
      content,
      imageUrl,
    })
  }
}
```

## File Validation

Validate file properties:

```typescript
@Controller()
class FileController {
  @Multipart(uploadImage)
  async uploadImage(params: MultipartParams<typeof uploadImage>) {
    const file = params.file

    // Validate MIME type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed: JPEG, PNG, WebP',
      )
    }

    // Validate size
    const buffer = await file.toBuffer()
    if (buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('File too large. Max size: 5MB')
    }

    return this.imageService.process(buffer)
  }
}
```

## Streaming to Storage

For large files, stream directly to storage:

```typescript
@Controller()
class FileController {
  private s3 = inject(S3Service)

  @Multipart(uploadLargeFile)
  async uploadLarge(params: MultipartParams<typeof uploadLargeFile>) {
    const file = params.file

    // Stream directly to S3
    const key = `uploads/${Date.now()}-${file.filename}`
    await this.s3.upload({
      Key: key,
      Body: file.stream,
      ContentType: file.mimetype,
    })

    return { key, filename: file.filename }
  }
}
```

## Configuration Options (Fastify)

These options apply to the Fastify adapter only:

```typescript
app.enableMultipart({
  limits: {
    fieldNameSize: 100, // Max field name size
    fieldSize: 1024 * 1024, // Max field value size (1MB)
    fields: 10, // Max non-file fields
    fileSize: 10 * 1024 * 1024, // Max file size (10MB)
    files: 5, // Max number of files
    headerPairs: 2000, // Max header key-value pairs
  },
})
```

## Error Handling

Handle upload errors:

```typescript
@Multipart(uploadFile)
async upload(params: MultipartParams<typeof uploadFile>) {
  try {
    const file = params.file

    if (!file) {
      throw new BadRequestException('No file provided')
    }

    const buffer = await file.toBuffer()
    return this.processFile(buffer)
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      throw new BadRequestException('File too large')
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      throw new BadRequestException('Too many files')
    }
    throw error
  }
}
```
