# @navios/storage Specification

## Overview

`@navios/storage` is a unified file storage abstraction for the Navios framework. It provides a consistent API for file operations across multiple storage backends with seamless integration into Navios's dependency injection system.

**Package:** `@navios/storage`
**Version:** 0.1.0
**License:** MIT
**Dependencies:** None (adapters are optional)
**Peer Dependencies:** `@navios/core`, `@navios/di`
**Optional Dependencies:**
- `@aws-sdk/client-s3` (^3.x) - AWS S3
- `@google-cloud/storage` (^7.x) - Google Cloud Storage
- `@azure/storage-blob` (^12.x) - Azure Blob Storage

---

## Core Concepts

### Architecture Overview

```
StorageService
├── Core Operations
│   ├── put(path, content) - Upload file
│   ├── get(path) - Download file
│   ├── delete(path) - Delete file
│   ├── exists(path) - Check existence
│   ├── url(path) - Get public URL
│   ├── signedUrl(path, options) - Get signed URL
│   ├── copy(from, to) - Copy file
│   ├── move(from, to) - Move file
│   └── list(prefix) - List files
│
├── Adapters (Disks)
│   ├── LocalAdapter - Local filesystem
│   ├── S3Adapter - AWS S3 / S3-compatible
│   ├── GCSAdapter - Google Cloud Storage
│   ├── AzureAdapter - Azure Blob Storage
│   └── Custom adapters via StorageAdapter interface
│
└── Integration
    ├── @Multipart() - File upload handling
    └── @Stream() - File streaming
```

### Key Principles

- **Unified API** - Same interface across all storage backends
- **DI Integration** - Injectable service via @navios/di
- **Streaming Support** - Efficient handling of large files
- **Type-Safe** - Full TypeScript support
- **Multi-Disk** - Multiple storage configurations

---

## Setup

### Provider Function

The storage service is configured using the `provideStorageService()` function which returns an `InjectionToken`.

```typescript
import { provideStorageService, LocalAdapter } from '@navios/storage'

// Basic configuration (Local Storage)
const StorageToken = provideStorageService({
  default: 'local',
  disks: {
    local: {
      adapter: new LocalAdapter({
        root: './storage',
        publicPath: '/files',
      }),
    },
  },
})

// Async configuration
const StorageToken = provideStorageService(async () => {
  const config = await loadConfig()
  return {
    default: config.storage.default,
    disks: {
      s3: {
        adapter: new S3Adapter({
          bucket: config.aws.s3Bucket,
          region: config.aws.region,
        }),
      },
    },
  }
})
```

### AWS S3 Configuration

```typescript
import { provideStorageService, S3Adapter } from '@navios/storage'

const StorageToken = provideStorageService({
  default: 's3',
  disks: {
    s3: {
      adapter: new S3Adapter({
        bucket: 'my-bucket',
        region: 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        // Optional: Custom endpoint for S3-compatible services
        endpoint: 'https://s3.custom-endpoint.com',
      }),
    },
  },
})
```

### Multi-Disk Configuration

```typescript
import { provideStorageService, LocalAdapter, S3Adapter, GCSAdapter, AzureAdapter } from '@navios/storage'

const StorageToken = provideStorageService({
  default: 'local',
  disks: {
    // Local disk for temporary files
    local: {
      adapter: new LocalAdapter({
        root: './storage/temp',
      }),
    },

    // S3 for user uploads
    uploads: {
      adapter: new S3Adapter({
        bucket: 'user-uploads',
        region: 'us-east-1',
      }),
    },

    // GCS for backups
    backups: {
      adapter: new GCSAdapter({
        bucket: 'app-backups',
        projectId: 'my-project',
        keyFilename: './gcs-key.json',
      }),
    },

    // Azure for media
    media: {
      adapter: new AzureAdapter({
        connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
        container: 'media',
      }),
    },
  },
})
```

### Module Registration

```typescript
import { Module } from '@navios/core'
import { provideStorageService, S3Adapter } from '@navios/storage'

const StorageToken = provideStorageService({
  default: 's3',
  disks: {
    s3: {
      adapter: new S3Adapter({
        bucket: 'my-bucket',
        region: 'us-east-1',
      }),
    },
  },
})

@Module({
  providers: [StorageToken],
})
class AppModule {}
```

---

## StorageService API

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { StorageService } from '@navios/storage'

@Injectable()
class FileService {
  private storage = inject(StorageService)
}
```

### put(path, content, options?)

Uploads a file to storage.

```typescript
// Upload from Buffer
await this.storage.put('images/photo.jpg', buffer)

// Upload from string
await this.storage.put('documents/readme.txt', 'Hello, World!')

// Upload from stream
await this.storage.put('videos/intro.mp4', readStream)

// With options
await this.storage.put('files/report.pdf', buffer, {
  contentType: 'application/pdf',
  visibility: 'public',
  metadata: {
    uploadedBy: userId,
    originalName: 'Q4 Report.pdf',
  },
})

// To specific disk
await this.storage.disk('backups').put('db/backup.sql', backupData)
```

**Parameters:**

| Parameter | Type                              | Description           |
| --------- | --------------------------------- | --------------------- |
| `path`    | `string`                          | File path in storage  |
| `content` | `Buffer \| string \| Readable`    | File content          |
| `options` | `PutOptions`                      | Upload options        |

**PutOptions:**

| Property      | Type                   | Description                    |
| ------------- | ---------------------- | ------------------------------ |
| `contentType` | `string`               | MIME type                      |
| `visibility`  | `'public' \| 'private'`| Access visibility              |
| `metadata`    | `Record<string, string>` | Custom metadata              |
| `cacheControl`| `string`               | Cache-Control header           |

**Returns:** `Promise<FileInfo>`

### get(path)

Downloads a file from storage.

```typescript
// Get as Buffer
const buffer = await this.storage.get('images/photo.jpg')

// Get as stream (for large files)
const stream = await this.storage.getStream('videos/movie.mp4')

// Get with metadata
const file = await this.storage.getWithMetadata('documents/report.pdf')
console.log(file.contentType, file.size, file.metadata)
```

**Returns:** `Promise<Buffer>`

### getStream(path)

Gets a file as a readable stream.

```typescript
const stream = await this.storage.getStream('videos/large-video.mp4')

// Pipe to response
stream.pipe(response)
```

**Returns:** `Promise<Readable>`

### delete(path)

Deletes a file from storage.

```typescript
await this.storage.delete('temp/old-file.txt')

// Delete multiple files
await this.storage.deleteMany([
  'temp/file1.txt',
  'temp/file2.txt',
  'temp/file3.txt',
])
```

**Returns:** `Promise<boolean>` - Whether the file existed

### exists(path)

Checks if a file exists.

```typescript
if (await this.storage.exists('images/avatar.jpg')) {
  // File exists
}
```

**Returns:** `Promise<boolean>`

### url(path)

Gets the public URL for a file.

```typescript
const url = await this.storage.url('images/public-photo.jpg')
// Returns: https://bucket.s3.amazonaws.com/images/public-photo.jpg
```

**Returns:** `Promise<string>`

### signedUrl(path, options)

Generates a signed/presigned URL for temporary access.

```typescript
// Download URL (GET)
const downloadUrl = await this.storage.signedUrl('files/private.pdf', {
  expiresIn: 3600, // 1 hour
})

// Upload URL (PUT)
const uploadUrl = await this.storage.signedUrl('uploads/new-file.jpg', {
  expiresIn: 300,
  method: 'PUT',
  contentType: 'image/jpeg',
})
```

**Options:**

| Property      | Type                  | Default  | Description              |
| ------------- | --------------------- | -------- | ------------------------ |
| `expiresIn`   | `number`              | `3600`   | Expiration in seconds    |
| `method`      | `'GET' \| 'PUT'`      | `'GET'`  | HTTP method              |
| `contentType` | `string`              | -        | Required content type    |
| `responseContentDisposition` | `string` | -    | Content-Disposition      |

**Returns:** `Promise<string>`

### copy(from, to, options?)

Copies a file within storage.

```typescript
await this.storage.copy('images/original.jpg', 'images/backup.jpg')

// Copy between disks
await this.storage.copy('temp/file.pdf', 'permanent/file.pdf', {
  fromDisk: 'local',
  toDisk: 'uploads',
})
```

**Returns:** `Promise<void>`

### move(from, to, options?)

Moves a file within storage.

```typescript
await this.storage.move('temp/upload.jpg', 'images/photo.jpg')

// Move between disks
await this.storage.move('temp/file.pdf', 'archive/file.pdf', {
  fromDisk: 'local',
  toDisk: 'backups',
})
```

**Returns:** `Promise<void>`

### list(prefix?, options?)

Lists files in storage.

```typescript
// List all files in a directory
const files = await this.storage.list('images/')

for (const file of files) {
  console.log(file.path, file.size, file.lastModified)
}

// With pagination
const result = await this.storage.list('uploads/', {
  limit: 100,
  cursor: lastCursor,
})

console.log(result.files)
console.log(result.nextCursor) // Use for next page
```

**Options:**

| Property   | Type     | Description                |
| ---------- | -------- | -------------------------- |
| `limit`    | `number` | Max files to return        |
| `cursor`   | `string` | Pagination cursor          |
| `recursive`| `boolean`| Include subdirectories     |

**Returns:** `Promise<FileInfo[]>` or `Promise<ListResult>`

### disk(name)

Gets a specific storage disk.

```typescript
// Use specific disk
const backupStorage = this.storage.disk('backups')
await backupStorage.put('db/backup.sql', data)

// Or chain
await this.storage.disk('uploads').put('users/avatar.jpg', image)
```

**Returns:** `StorageService` - Scoped to the specified disk

---

## Adapters

### LocalAdapter

Local filesystem storage.

```typescript
import { LocalAdapter } from '@navios/storage'

new LocalAdapter({
  root: './storage',        // Base directory
  publicPath: '/files',     // URL path for public files
  baseUrl: 'http://localhost:3000', // Base URL for URLs
})
```

**Options:**

| Property     | Type     | Description                    |
| ------------ | -------- | ------------------------------ |
| `root`       | `string` | Base directory path            |
| `publicPath` | `string` | URL path prefix for public files |
| `baseUrl`    | `string` | Base URL for generating URLs   |

### S3Adapter

AWS S3 and S3-compatible storage (MinIO, DigitalOcean Spaces, etc.).

```typescript
import { S3Adapter } from '@navios/storage'

new S3Adapter({
  bucket: 'my-bucket',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'AKIA...',
    secretAccessKey: 'secret',
  },

  // S3-compatible services
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  forcePathStyle: true,

  // Default options
  defaultVisibility: 'private',
  serverSideEncryption: 'AES256',
})
```

**Options:**

| Property               | Type       | Description                  |
| ---------------------- | ---------- | ---------------------------- |
| `bucket`               | `string`   | S3 bucket name               |
| `region`               | `string`   | AWS region                   |
| `credentials`          | `object`   | AWS credentials              |
| `endpoint`             | `string`   | Custom endpoint URL          |
| `forcePathStyle`       | `boolean`  | Use path-style URLs          |
| `defaultVisibility`    | `string`   | Default file visibility      |
| `serverSideEncryption` | `string`   | SSE algorithm                |

### GCSAdapter

Google Cloud Storage.

```typescript
import { GCSAdapter } from '@navios/storage'

new GCSAdapter({
  bucket: 'my-bucket',
  projectId: 'my-project',
  keyFilename: './service-account.json',
  // Or use inline credentials
  credentials: {
    client_email: '...',
    private_key: '...',
  },
})
```

**Options:**

| Property      | Type     | Description                    |
| ------------- | -------- | ------------------------------ |
| `bucket`      | `string` | GCS bucket name                |
| `projectId`   | `string` | Google Cloud project ID        |
| `keyFilename` | `string` | Path to service account key    |
| `credentials` | `object` | Inline credentials             |

### AzureAdapter

Azure Blob Storage.

```typescript
import { AzureAdapter } from '@navios/storage'

new AzureAdapter({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  container: 'my-container',

  // Or use account credentials
  account: 'storageaccount',
  accountKey: 'key',

  // Or use SAS token
  sasToken: 'sv=2020-08-04&ss=b&srt=sco...',
})
```

**Options:**

| Property           | Type     | Description                    |
| ------------------ | -------- | ------------------------------ |
| `connectionString` | `string` | Azure connection string        |
| `container`        | `string` | Blob container name            |
| `account`          | `string` | Storage account name           |
| `accountKey`       | `string` | Storage account key            |
| `sasToken`         | `string` | SAS token                      |

### Custom Adapter

Implement the `StorageAdapter` interface for custom backends.

```typescript
import { StorageAdapter, FileInfo, PutOptions, SignedUrlOptions } from '@navios/storage'
import { Readable } from 'stream'

class CustomAdapter implements StorageAdapter {
  async put(path: string, content: Buffer | Readable, options?: PutOptions): Promise<FileInfo> {
    // Implementation
  }

  async get(path: string): Promise<Buffer> {
    // Implementation
  }

  async getStream(path: string): Promise<Readable> {
    // Implementation
  }

  async delete(path: string): Promise<boolean> {
    // Implementation
  }

  async exists(path: string): Promise<boolean> {
    // Implementation
  }

  async url(path: string): Promise<string> {
    // Implementation
  }

  async signedUrl(path: string, options: SignedUrlOptions): Promise<string> {
    // Implementation
  }

  async copy(from: string, to: string): Promise<void> {
    // Implementation
  }

  async move(from: string, to: string): Promise<void> {
    // Implementation
  }

  async list(prefix: string, options?: ListOptions): Promise<FileInfo[]> {
    // Implementation
  }

  // Lifecycle
  async onServiceDestroy?(): Promise<void> {
    // Cleanup
  }
}
```

---

## Integration with Multipart Uploads

Use with Navios `@Multipart()` decorator for file uploads.

```typescript
import { Controller, Multipart, MultipartFile } from '@navios/core'
import { inject } from '@navios/di'
import { StorageService } from '@navios/storage'
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

const uploadFile = API.declareEndpoint({
  method: 'POST',
  path: '/upload',
  responseSchema: z.object({
    path: z.string(),
    url: z.string(),
    size: z.number(),
  }),
})

@Controller()
class UploadController {
  private storage = inject(StorageService)

  @Multipart(uploadFile, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  })
  async upload(params: MultipartParams<typeof uploadFile>): Promise<UploadResult> {
    const file = params.file as MultipartFile

    // Generate unique path
    const path = `uploads/${Date.now()}-${file.filename}`

    // Upload to storage
    const result = await this.storage.put(path, file.buffer, {
      contentType: file.mimetype,
      metadata: {
        originalName: file.filename,
        uploadedBy: params.request.user?.id,
      },
    })

    return {
      path: result.path,
      url: await this.storage.url(result.path),
      size: result.size,
    }
  }
}
```

### Streaming Large Files

```typescript
@Controller()
class LargeUploadController {
  private storage = inject(StorageService)

  @Multipart(uploadLargeFile, { streaming: true })
  async uploadStreaming(params: StreamingMultipartParams): Promise<void> {
    for await (const part of params.parts) {
      if (part.type === 'file') {
        const path = `large-uploads/${part.filename}`

        // Stream directly to storage without buffering
        await this.storage.put(path, part.stream, {
          contentType: part.mimetype,
        })
      }
    }
  }
}
```

---

## File Downloads & Streaming

### Direct Download

```typescript
import { Controller, Endpoint, Stream } from '@navios/core'
import { inject } from '@navios/di'
import { StorageService } from '@navios/storage'
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

const downloadFile = API.declareEndpoint({
  method: 'GET',
  path: '/files/:fileId/download',
  paramsSchema: z.object({
    fileId: z.string(),
  }),
})

@Controller()
class DownloadController {
  private storage = inject(StorageService)

  @Stream(downloadFile)
  async download(params: StreamParams<typeof downloadFile>) {
    const path = `files/${params.fileId}`

    if (!await this.storage.exists(path)) {
      throw new NotFoundException('File not found')
    }

    const stream = await this.storage.getStream(path)
    const info = await this.storage.getMetadata(path)

    return {
      stream,
      contentType: info.contentType,
      contentLength: info.size,
      filename: info.metadata?.originalName ?? params.fileId,
    }
  }
}
```

### Redirect to Signed URL

```typescript
const getDownloadUrl = API.declareEndpoint({
  method: 'GET',
  path: '/files/:fileId/url',
  paramsSchema: z.object({
    fileId: z.string(),
  }),
  querySchema: z.object({
    filename: z.string().optional(),
  }),
  responseSchema: z.object({
    url: z.string(),
  }),
})

@Controller()
class SecureDownloadController {
  private storage = inject(StorageService)

  @Endpoint(getDownloadUrl)
  async getUrl(params: EndpointParams<typeof getDownloadUrl>) {
    const path = `private/${params.fileId}`

    // Generate signed URL for direct download
    const url = await this.storage.signedUrl(path, {
      expiresIn: 300, // 5 minutes
      responseContentDisposition: `attachment; filename="${params.query.filename ?? params.fileId}"`,
    })

    return { url }
  }
}
```

---

## Complete Example

```typescript
// storage.provider.ts
import { provideStorageService, LocalAdapter, S3Adapter } from '@navios/storage'

export const StorageToken = provideStorageService({
  default: process.env.NODE_ENV === 'production' ? 's3' : 'local',
  disks: {
    local: {
      adapter: new LocalAdapter({
        root: './storage',
        publicPath: '/files',
        baseUrl: process.env.BASE_URL,
      }),
    },
    s3: {
      adapter: new S3Adapter({
        bucket: process.env.S3_BUCKET!,
        region: process.env.AWS_REGION!,
      }),
    },
  },
})
```

```typescript
// services/file.service.ts
import { Injectable, inject } from '@navios/di'
import { StorageService } from '@navios/storage'
import { randomUUID } from 'crypto'

@Injectable()
class FileService {
  private storage = inject(StorageService)
  private db = inject(DatabaseService)

  async upload(
    file: Buffer,
    filename: string,
    userId: string
  ): Promise<FileRecord> {
    const id = randomUUID()
    const ext = filename.split('.').pop()
    const path = `uploads/${userId}/${id}.${ext}`

    const info = await this.storage.put(path, file, {
      metadata: {
        originalName: filename,
        uploadedBy: userId,
      },
    })

    const record = await this.db.files.create({
      data: {
        id,
        path,
        size: info.size,
        contentType: info.contentType,
        originalName: filename,
        userId,
      },
    })

    return record
  }

  async getDownloadUrl(fileId: string, userId: string): Promise<string> {
    const file = await this.db.files.findFirst({
      where: { id: fileId, userId },
    })

    if (!file) {
      throw new NotFoundException('File not found')
    }

    return this.storage.signedUrl(file.path, {
      expiresIn: 3600,
      responseContentDisposition: `attachment; filename="${file.originalName}"`,
    })
  }

  async delete(fileId: string, userId: string): Promise<void> {
    const file = await this.db.files.findFirst({
      where: { id: fileId, userId },
    })

    if (!file) {
      throw new NotFoundException('File not found')
    }

    await this.storage.delete(file.path)
    await this.db.files.delete({ where: { id: fileId } })
  }

  async listUserFiles(userId: string): Promise<FileRecord[]> {
    return this.db.files.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }
}
```

```typescript
// controllers/file.controller.ts
import { Controller, Endpoint, Multipart, Stream } from '@navios/core'
import { inject } from '@navios/di'
import { StorageService } from '@navios/storage'
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

const uploadEndpoint = API.declareEndpoint({
  method: 'POST',
  path: '/files',
  responseSchema: FileSchema,
})

const getDownloadUrl = API.declareEndpoint({
  method: 'GET',
  path: '/files/:fileId/url',
  paramsSchema: z.object({ fileId: z.string() }),
  responseSchema: z.object({ url: z.string() }),
})

const downloadDirect = API.declareEndpoint({
  method: 'GET',
  path: '/files/:fileId/download',
  paramsSchema: z.object({ fileId: z.string() }),
})

const deleteFile = API.declareEndpoint({
  method: 'DELETE',
  path: '/files/:fileId',
  paramsSchema: z.object({ fileId: z.string() }),
  responseSchema: z.object({ success: z.boolean() }),
})

const listFiles = API.declareEndpoint({
  method: 'GET',
  path: '/files',
  responseSchema: z.array(FileSchema),
})

@Controller()
class FileController {
  private fileService = inject(FileService)
  private storage = inject(StorageService)
  private db = inject(DatabaseService)

  @Multipart(uploadEndpoint, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  })
  async upload(params: MultipartParams<typeof uploadEndpoint>) {
    const file = params.file
    return this.fileService.upload(
      file.buffer,
      file.filename,
      params.request.user.id
    )
  }

  @Endpoint(getDownloadUrl)
  async getUrl(params: EndpointParams<typeof getDownloadUrl>) {
    return {
      url: await this.fileService.getDownloadUrl(
        params.fileId,
        params.request.user.id
      ),
    }
  }

  @Stream(downloadDirect)
  async download(params: StreamParams<typeof downloadDirect>) {
    const file = await this.db.files.findFirst({
      where: { id: params.fileId },
    })

    if (!file) {
      throw new NotFoundException('File not found')
    }

    return {
      stream: await this.storage.getStream(file.path),
      contentType: file.contentType,
      filename: file.originalName,
    }
  }

  @Endpoint(deleteFile)
  async delete(params: EndpointParams<typeof deleteFile>) {
    await this.fileService.delete(params.fileId, params.request.user.id)
    return { success: true }
  }

  @Endpoint(listFiles)
  async list(params: EndpointParams<typeof listFiles>) {
    return this.fileService.listUserFiles(params.request.user.id)
  }
}
```

```typescript
// modules/app.module.ts
import { Module } from '@navios/core'
import { StorageToken } from './storage.provider'

@Module({
  providers: [StorageToken, FileService],
  controllers: [FileController],
})
class AppModule {}
```

---

## API Reference Summary

### Provider Function

| Export                 | Type     | Description                      |
| ---------------------- | -------- | -------------------------------- |
| `provideStorageService`| Function | Creates storage service provider |

### Service & Types

| Export           | Type    | Description                      |
| ---------------- | ------- | -------------------------------- |
| `StorageService` | Class   | Main storage service             |
| `LocalAdapter`   | Class   | Local filesystem adapter         |
| `S3Adapter`      | Class   | AWS S3 adapter                   |
| `GCSAdapter`     | Class   | Google Cloud Storage adapter     |
| `AzureAdapter`   | Class   | Azure Blob Storage adapter       |

### StorageService Methods

| Method         | Return               | Description                    |
| -------------- | -------------------- | ------------------------------ |
| `put`          | `Promise<FileInfo>`  | Upload file                    |
| `get`          | `Promise<Buffer>`    | Download file as buffer        |
| `getStream`    | `Promise<Readable>`  | Download file as stream        |
| `getMetadata`  | `Promise<FileInfo>`  | Get file metadata              |
| `delete`       | `Promise<boolean>`   | Delete file                    |
| `deleteMany`   | `Promise<number>`    | Delete multiple files          |
| `exists`       | `Promise<boolean>`   | Check if file exists           |
| `url`          | `Promise<string>`    | Get public URL                 |
| `signedUrl`    | `Promise<string>`    | Get signed URL                 |
| `copy`         | `Promise<void>`      | Copy file                      |
| `move`         | `Promise<void>`      | Move file                      |
| `list`         | `Promise<FileInfo[]>`| List files                     |
| `disk`         | `StorageService`     | Get specific disk              |

### FileInfo Type

| Property       | Type                   | Description                    |
| -------------- | ---------------------- | ------------------------------ |
| `path`         | `string`               | File path                      |
| `size`         | `number`               | File size in bytes             |
| `contentType`  | `string`               | MIME type                      |
| `lastModified` | `Date`                 | Last modified date             |
| `metadata`     | `Record<string, string>`| Custom metadata               |
| `visibility`   | `'public' \| 'private'`| Access visibility             |
