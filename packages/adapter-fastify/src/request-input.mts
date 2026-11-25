import { createMultipartCollector, HttpException } from '@navios/core'

import type { RouteInput, SchemaLike } from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { FastifyEnvironment } from './environment.mjs'
import type { FastifyAdapter } from './fastify-adapter.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const RAW_BODY = Symbol('navios.rawBody')

/**
 * One request as the pipeline sees it. Methods live on the prototype so that
 * a request allocates one object, not one closure per accessor.
 */
export class FastifyRouteInput implements RouteInput {
  readonly raw: FastifyEnvironment['raw']
  private abort: AbortController | null = null

  constructor(
    private readonly request: FastifyRequest,
    private readonly reply: FastifyReply,
    private readonly adapter: FastifyAdapter,
    private readonly requestSchema: SchemaLike | undefined,
  ) {
    this.raw = { request, reply }
  }

  get method(): string {
    return this.request.method
  }

  get path(): string {
    const url = this.request.url
    const query = url.indexOf('?')
    return query < 0 ? url : url.slice(0, query)
  }

  get id(): string {
    return this.request.id
  }

  get urlParams(): Record<string, string> {
    return this.request.params as Record<string, string>
  }

  header(name: string): string | undefined {
    const value = this.request.headers[name.toLowerCase()]
    return Array.isArray(value) ? value.join(', ') : value
  }

  headers(): Headers {
    const headers = new Headers()
    for (const [name, value] of Object.entries(this.request.headers)) {
      if (value === undefined) {
        continue
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(name, item)
        }
      } else {
        headers.set(name, value)
      }
    }
    return headers
  }

  headerRecord(): Record<string, string | undefined> {
    // `set-cookie` is the only header Node keeps as a list, and not one that
    // a request normally has.
    const { 'set-cookie': cookies, ...headers } = this.request.headers
    const record = headers as Record<string, string | undefined>
    if (cookies !== undefined) {
      record['set-cookie'] = cookies.join(', ')
    }
    return record
  }

  query(): unknown {
    return this.request.query
  }

  body(): unknown | Promise<unknown> {
    const { request } = this
    if (typeof (request as any).isMultipart === 'function' && (request as any).isMultipart()) {
      return this.readMultipart()
    }
    const body = request.body as any
    if (body !== null && typeof body === 'object' && RAW_BODY in body) {
      return this.adapter.parseJson(request, body[RAW_BODY] as string)
    }
    return body
  }

  private async readMultipart(): Promise<Record<string, unknown>> {
    const collector = createMultipartCollector(this.requestSchema)
    try {
      for await (const part of (this.request as any).parts()) {
        if (part.type === 'file') {
          collector.add(
            part.fieldname,
            new File([await part.toBuffer()], part.filename, { type: part.mimetype }),
          )
        } else {
          if (part.fieldnameTruncated || part.valueTruncated) {
            // `@fastify/multipart` cuts a field at `limits.fieldSize` (or its
            // name at `limits.fieldNameSize`) and carries on. Half a value
            // must not reach the handler.
            throw new HttpException(413, 'request field too large')
          }
          collector.add(part.fieldname, part.value as string)
        }
      }
    } catch (error) {
      throw toClientError(error)
    }
    return collector.result()
  }

  responded(): boolean {
    return this.reply.sent
  }

  signal(): AbortSignal {
    if (this.abort === null) {
      const abort = new AbortController()
      this.abort = abort
      // The response tells whether the client is there. The request emits
      // 'close' as soon as its body has been consumed.
      const { raw } = this.reply
      const abortIfGone = () => {
        if (!raw.writableFinished) {
          abort.abort()
        }
      }
      if (raw.destroyed) {
        abortIfGone()
      } else {
        raw.once('close', abortIfGone)
      }
    }
    return this.abort.signal
  }
}

/**
 * `@fastify/multipart` rejects a body over one of its `limits` (413), and
 * other bodies a client got wrong, with a Fastify error that carries a 4xx
 * status. The body is read inside the pipeline, where Fastify's error handler
 * does not see it, so the error is turned into the same problem response here.
 */
function toClientError(error: unknown): unknown {
  const { code, statusCode } = (error ?? {}) as { code?: unknown; statusCode?: unknown }
  if (
    typeof code === 'string' &&
    code.startsWith('FST_') &&
    typeof statusCode === 'number' &&
    statusCode >= 400 &&
    statusCode < 500
  ) {
    return new HttpException(statusCode, String((error as Error).message ?? ''), error)
  }
  return error
}
