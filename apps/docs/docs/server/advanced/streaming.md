---
sidebar_position: 3
title: Streaming
---

# Streaming

Handle streaming responses for real-time data, Server-Sent Events (SSE), and large file downloads.

## Stream Endpoints

Use `declareStream` from `@navios/builder` and the `@Stream()` decorator:

```typescript
import { builder } from '@navios/builder'

const API = builder()

const streamEvents = API.declareStream({
  url: '/events/stream',
})
```

## Adapter Differences

### Fastify Adapter

Use the `reply` object to write to the response stream:

```typescript
@Stream(streamEvents)
async streamEvents(params: StreamParams<typeof streamEvents>, reply: Reply) {
  reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream' })
  reply.raw.write('data: hello\n\n')
  reply.raw.end()
}
```

### Bun Adapter

Return a `Response` object or `BodyInit` (the first argument for the Response constructor):

```typescript
@Stream(streamEvents)
async streamEvents(params: StreamParams<typeof streamEvents>) {
  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue('data: hello\n\n')
        controller.close()
      },
    }),
    {
      headers: { 'Content-Type': 'text/event-stream' },
    }
  )
}
```

## Server-Sent Events (SSE) - Fastify

Implement real-time event streaming:

```typescript
import { Controller, Reply, Stream, StreamParams } from '@navios/core'

@Controller()
class EventController {
  @Stream(streamEvents)
  async streamEvents(params: StreamParams<typeof streamEvents>, reply: Reply) {
    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    // Send events
    const sendEvent = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    // Initial event
    sendEvent({ type: 'connected', timestamp: Date.now() })

    // Subscribe to events
    const unsubscribe = this.eventService.subscribe((event) => {
      sendEvent(event)
    })

    // Handle client disconnect
    reply.raw.on('close', () => {
      unsubscribe()
    })
  }
}
```

## File Downloads

### Fastify

Stream large files efficiently:

```typescript
const downloadFile = API.declareStream({
  url: '/files/$fileId/download',
})

@Controller()
class FileController {
  private storage = inject(StorageService)

  @Stream(downloadFile)
  async downloadFile(params: StreamParams<typeof downloadFile>, reply: Reply) {
    const { fileId } = params.urlParams
    const file = await this.storage.getFile(fileId)

    if (!file) {
      throw new NotFoundException('File not found')
    }

    reply.raw.writeHead(200, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Content-Length': file.size,
    })

    // Pipe file stream to response
    const stream = await this.storage.createReadStream(fileId)
    stream.pipe(reply.raw)
  }
}
```

### Bun

Return a `Response` with the file buffer:

```typescript
@Controller()
class FileController {
  private storage = inject(StorageService)

  @Stream(downloadFile)
  async downloadFile(params: StreamParams<typeof downloadFile>) {
    const { fileId } = params.urlParams
    const file = await this.storage.getFile(fileId)

    if (!file) {
      throw new NotFoundException('File not found')
    }

    // Get buffer from S3 or other storage
    const buffer = await this.storage.getBuffer(fileId)

    return new Response(buffer, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${file.name}"`,
        'Content-Length': String(file.size),
      },
    })
  }
}
```

## Real-Time Progress (Fastify)

Stream progress updates:

```typescript
const processTask = API.declareStream({
  method: 'POST',
  url: '/tasks/process',
  requestSchema: z.object({ taskId: z.string() }),
})

@Controller()
class TaskController {
  @Stream(processTask)
  async processTask(params: StreamParams<typeof processTask>, reply: Reply) {
    const { taskId } = params.data

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    })

    const sendProgress = (progress: number, status: string) => {
      reply.raw.write(`data: ${JSON.stringify({ progress, status })}\n\n`)
    }

    sendProgress(0, 'Starting...')

    // Simulate processing steps
    await this.step1(taskId)
    sendProgress(25, 'Step 1 complete')

    await this.step2(taskId)
    sendProgress(50, 'Step 2 complete')

    await this.step3(taskId)
    sendProgress(75, 'Step 3 complete')

    await this.step4(taskId)
    sendProgress(100, 'Complete!')

    reply.raw.end()
  }
}
```

## Chunked JSON Streaming (Fastify)

Stream large JSON arrays:

```typescript
@Controller()
class ExportController {
  @Stream(exportUsers)
  async exportUsers(params: StreamParams<typeof exportUsers>, reply: Reply) {
    reply.raw.writeHead(200, {
      'Content-Type': 'application/json',
    })

    reply.raw.write('[\n')

    let first = true
    for await (const user of this.userService.streamAll()) {
      if (!first) {
        reply.raw.write(',\n')
      }
      reply.raw.write(JSON.stringify(user))
      first = false
    }

    reply.raw.write('\n]')
    reply.raw.end()
  }
}
```

## Client-Side Consumption

Connect to SSE endpoints from the client:

```typescript
// Browser
const eventSource = new EventSource('/events/stream')

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log('Received:', data)
}

eventSource.onerror = (error) => {
  console.error('SSE Error:', error)
  eventSource.close()
}

// Clean up
// eventSource.close()
```

## Error Handling in Streams (Fastify)

Handle errors gracefully:

```typescript
@Stream(streamData)
async streamData(params: StreamParams<typeof streamData>, reply: Reply) {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
  })

  try {
    for await (const item of this.dataSource.stream()) {
      reply.raw.write(`data: ${JSON.stringify(item)}\n\n`)
    }
  } catch (error) {
    // Send error event before closing
    reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
  } finally {
    reply.raw.end()
  }
}
```
