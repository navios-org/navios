import { BadRequestException, Controller, Endpoint, inject, NotFoundException } from '@navios/server'

import type { HandlerParams, RequestContext } from '@navios/server'

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

  @Endpoint(uploadFileEndpoint)
  async uploadFile({ data: { file } }: HandlerParams<typeof uploadFileEndpoint>) {
    if (!file) {
      throw new BadRequestException('File is required')
    }

    const metadata = await this.filesService.upload({
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      content: await file.arrayBuffer(),
    })

    return {
      id: metadata.id,
      filename: metadata.filename,
      size: metadata.size,
      mimeType: metadata.mimeType,
      createdAt: metadata.createdAt,
    }
  }

  @Endpoint(uploadMultipleEndpoint)
  async uploadMultiple({ data: { files } }: HandlerParams<typeof uploadMultipleEndpoint>) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required')
    }

    const uploaded: { id: string; filename: string }[] = []

    for (const file of files) {
      const metadata = await this.filesService.upload({
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        content: await file.arrayBuffer(),
      })
      uploaded.push({ id: metadata.id, filename: metadata.filename })
    }

    return { uploaded, total: uploaded.length }
  }

  // response: 'blob'
  @Endpoint(downloadFileEndpoint)
  @Public()
  async downloadFile(
    { urlParams }: HandlerParams<typeof downloadFileEndpoint>,
    ctx: RequestContext,
  ) {
    const file = await this.filesService.findById(urlParams.fileId)
    if (!file) {
      throw new NotFoundException('File not found')
    }

    ctx.reply.header('content-type', file.mimeType)
    ctx.reply.header('content-disposition', `attachment; filename="${file.filename}"`)
    return file.content
  }

  // response: 'stream'
  @Endpoint(streamEventsEndpoint)
  @Public()
  streamEvents({ params }: HandlerParams<typeof streamEventsEndpoint>, ctx: RequestContext) {
    const topic = params.topic ?? 'default'

    ctx.reply.header('content-type', 'text/event-stream')
    ctx.reply.header('cache-control', 'no-cache')

    return (async function* () {
      for (let i = 1; i <= 3; i++) {
        const event = {
          id: i,
          topic,
          message: `Event ${i}`,
          timestamp: new Date().toISOString(),
        }
        yield `data: ${JSON.stringify(event)}\n\n`
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    })()
  }

  // response: 'text'
  @Endpoint(exportDataEndpoint)
  @Public()
  async exportData(
    { data: { format, type } }: HandlerParams<typeof exportDataEndpoint>,
    ctx: RequestContext,
  ) {
    // Posts would need injection
    const rows: object[] = type === 'users' ? (await this.usersService.findAll(1, 1000)).users : []

    ctx.reply.header('content-disposition', `attachment; filename="${type}.${format}"`)

    if (format === 'json') {
      ctx.reply.header('content-type', 'application/json')
      return JSON.stringify(rows, null, 2)
    }

    ctx.reply.header('content-type', 'text/csv')
    if (rows.length === 0) {
      return ''
    }

    const columns = Object.keys(rows[0])
    const lines = rows.map((row) =>
      columns.map((column) => JSON.stringify(Reflect.get(row, column) ?? '')).join(','),
    )
    return [columns.join(','), ...lines].join('\n')
  }
}
