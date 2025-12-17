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

Use `declareMultipart` from `@navios/builder` to define multipart endpoints:

```typescript
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

const uploadFile = API.declareMultipart({
  url: '/files/upload',
  responseSchema: z.object({
    fileId: z.string(),
    filename: z.string(),
    size: z.number(),
  }),
})
```

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

## Multiple Files

Handle multiple file uploads:

```typescript
const uploadMultiple = API.declareMultipart({
  url: '/files/batch',
  responseSchema: z.array(z.object({
    fileId: z.string(),
    filename: z.string(),
  })),
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
const createPost = API.declareMultipart({
  url: '/posts',
  dataSchema: z.object({
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
      throw new BadRequestException('Invalid file type. Allowed: JPEG, PNG, WebP')
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
    fieldNameSize: 100,      // Max field name size
    fieldSize: 1024 * 1024,  // Max field value size (1MB)
    fields: 10,              // Max non-file fields
    fileSize: 10 * 1024 * 1024, // Max file size (10MB)
    files: 5,                // Max number of files
    headerPairs: 2000,       // Max header key-value pairs
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
