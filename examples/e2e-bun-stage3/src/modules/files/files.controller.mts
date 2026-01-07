import type { MultipartParams, StreamParams } from '@navios/core'

import { BadRequestException, Controller, inject, Multipart, NotFoundException, Stream } from '@navios/core'

import {
  downloadFileEndpoint,
  exportDataEndpoint,
  streamEventsEndpoint,
  uploadFileEndpoint,
  uploadMultipleEndpoint,
} from '../../api/endpoints.mjs'
import { Public } from '../../guards/public.attribute.mjs'
import { UsersService } from '../users/users.service.mjs'

import { FilesService } from './files.service.mjs'

@Controller()
export class FilesController {
  private readonly filesService = inject(FilesService)
  private readonly usersService = inject(UsersService)

  @Multipart(uploadFileEndpoint)
  async uploadFile(params: MultipartParams<typeof uploadFileEndpoint>) {
    const { file } = params.data
    if (!file) {
      throw new BadRequestException('File is required')
    }

    const content = await file.arrayBuffer()
    const metadata = await this.filesService.upload({
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      content,
    })

    return {
      id: metadata.id,
      filename: metadata.filename,
      size: metadata.size,
      mimeType: metadata.mimeType,
      createdAt: metadata.createdAt,
    }
  }

  @Multipart(uploadMultipleEndpoint)
  async uploadMultiple(params: MultipartParams<typeof uploadMultipleEndpoint>) {
    const { files } = params.data
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required')
    }

    const uploaded: { id: string; filename: string }[] = []

    for (const file of files) {
      const content = await file.arrayBuffer()
      const metadata = await this.filesService.upload({
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        content,
      })
      uploaded.push({ id: metadata.id, filename: metadata.filename })
    }

    return { uploaded, total: uploaded.length }
  }

  @Stream(downloadFileEndpoint)
  @Public()
  async downloadFile(params: StreamParams<typeof downloadFileEndpoint>) {
    const fileId = params.urlParams.fileId
    const file = await this.filesService.findById(fileId)

    if (!file) {
      throw new NotFoundException('File not found')
    }

    return new Response(Buffer.from(file.content), {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Content-Length': file.size.toString(),
      },
    })
  }

  @Stream(streamEventsEndpoint)
  @Public()
  async streamEvents(params: StreamParams<typeof streamEventsEndpoint>) {
    const topic = params.params.topic ?? 'default'

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 1; i <= 3; i++) {
          const event = {
            id: i,
            topic,
            message: `Event ${i}`,
            timestamp: new Date().toISOString(),
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        controller.close()
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  @Stream(exportDataEndpoint)
  @Public()
  async exportData(params: StreamParams<typeof exportDataEndpoint>) {
    const { format, type } = params.data

    let data: unknown[]
    if (type === 'users') {
      const result = await this.usersService.findAll(1, 1000)
      data = result.users
    } else {
      data = [] // Posts would need injection
    }

    if (format === 'json') {
      return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${type}.json"`,
        },
      })
    } else {
      // CSV format
      if (data.length === 0) {
        return new Response('', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${type}.csv"`,
          },
        })
      }

      const headers = Object.keys(data[0] as object)
      const rows = data.map((item) =>
        headers.map((h) => JSON.stringify((item as Record<string, unknown>)[h] ?? '')).join(','),
      )
      const csv = [headers.join(','), ...rows].join('\n')

      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${type}.csv"`,
        },
      })
    }
  }
}
