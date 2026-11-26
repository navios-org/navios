import { Readable } from 'node:stream'

import { HttpException } from '@navios/server'
import {
  bodyTooLarge,
  canonicalPath,
  incompleteBody,
  malformedMultipart,
} from '@navios/server/adapter'

import type { BodyPart, BodySource, RouteInput } from '@navios/server/adapter'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { FastifyEnvironment } from './environment.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Where the adapter's parser leaves the bytes of a body on a request. */
export const RAW_BODY = Symbol('navios.rawBody')

const NO_ADDRESS = Symbol('navios.noAddress')

/**
 * What the request of `inject()` inherits from when the test request gives no
 * address. Fastify then gives it one, which hooks and plugins may rely on.
 */
export class RequestWithoutAddress extends Readable {
  get [NO_ADDRESS](): true {
    return true
  }
}

const NO_BYTES = new Uint8Array()

/**
 * One request as the pipeline sees it. Methods live on the prototype so that
 * a request allocates one object, not one closure per accessor. It is its own
 * body source.
 */
export class FastifyRouteInput implements RouteInput, BodySource {
  readonly raw: FastifyEnvironment['raw']
  private abort: AbortController | null = null

  constructor(
    private readonly request: FastifyRequest,
    private readonly reply: FastifyReply,
    /** How many bytes a multipart body may have. */
    private readonly multipartLimit: number,
  ) {
    this.raw = { request, reply }
  }

  get method(): string {
    return this.request.method
  }

  get path(): string {
    return canonicalPath(this.request.url)
  }

  get id(): string {
    return this.request.id
  }

  get urlParams(): Record<string, string> {
    return this.request.params as Record<string, string>
  }

  url(): string {
    const { url, protocol, host } = this.request
    return host && url.startsWith('/') ? `${protocol}://${host}${url}` : url
  }

  remoteAddress(): string | undefined {
    const { ip, raw } = this.request
    return NO_ADDRESS in raw && ip === raw.socket.remoteAddress ? undefined : ip
  }

  header(name: string): string | undefined {
    const value: unknown = this.request.headers[name.toLowerCase()]
    if (typeof value === 'string') {
      return value
    }
    // Anything else is a member of every object, such as `constructor`.
    return Array.isArray(value) ? value.join(', ') : undefined
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

  // --------------------------------------------------------------------------
  // Body
  // --------------------------------------------------------------------------

  get body(): BodySource {
    return this
  }

  get contentType(): string | undefined {
    return this.request.headers['content-type']
  }

  get isEmpty(): boolean {
    const { request } = this
    if (isMultipart(request)) {
      const { 'content-length': length, 'transfer-encoding': encoding } = request.headers
      return length === undefined ? encoding === undefined : length === '0'
    }
    const bytes = (request as any)[RAW_BODY] as Uint8Array | null
    return bytes === null ? request.body === undefined : bytes.byteLength === 0
  }

  parsed(): { value: unknown } | undefined {
    const { request } = this
    // A parser or a hook of the application may have set it.
    return request.body === undefined || request.body === (request as any)[RAW_BODY]
      ? undefined
      : { value: request.body }
  }

  bytes(): Uint8Array | Promise<Uint8Array> {
    const { request } = this
    const bytes = (request as any)[RAW_BODY] as Uint8Array | null
    if (bytes !== null) {
      return bytes
    }
    if (isMultipart(request)) {
      return this.readStream()
    }
    if (request.body !== undefined) {
      throw new Error(
        `[Navios] The bytes of a body of the type ${this.contentType} are not available: a content ` +
          `type parser that was added to Fastify has read them.`,
      )
    }
    return NO_BYTES
  }

  /** Reads a multipart body, which no parser of Fastify has read. */
  private readStream(): Promise<Uint8Array> {
    const { raw } = this.request
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      const refuse = (error: unknown) => {
        raw.off('data', collect)
        // What is left is read and dropped, so that the client gets the answer.
        raw.resume()
        reject(error)
      }
      const collect = (chunk: Buffer) => {
        size += chunk.byteLength
        if (size > this.multipartLimit) {
          refuse(bodyTooLarge())
        } else {
          chunks.push(chunk)
        }
      }
      raw.on('data', collect)
      raw.once('end', () => resolve(Buffer.concat(chunks)))
      raw.once('error', () => refuse(incompleteBody()))
      raw.once('close', () => refuse(incompleteBody()))
    })
  }

  async *parts(): AsyncGenerator<BodyPart, void, undefined> {
    const { request } = this
    const iterator = (request as any).parts() as AsyncGenerator<any>
    let left = this.multipartLimit
    try {
      for (;;) {
        const { done, value } = await readPart(iterator)
        if (done) {
          return
        }
        left -= value.size
        if (left < 0) {
          throw bodyTooLarge()
        }
        if (value.name) {
          yield { name: value.name, value: value.content }
        }
      }
    } finally {
      void iterator.return(undefined)
      // A body that was not read to its end is read and dropped, so that the
      // client gets the answer.
      const { raw } = request
      if (!raw.readableEnded && !raw.destroyed) {
        raw.unpipe()
        raw.resume()
      }
    }
  }

  // --------------------------------------------------------------------------

  responded(): boolean {
    return this.reply.sent
  }

  respondedStatus(): number {
    return this.reply.raw.statusCode
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

/** Whether `@fastify/multipart` takes the body, which it only does when it is asked for parts. */
function isMultipart(request: FastifyRequest): boolean {
  return (request as any).isMultipart?.() === true && request.body === undefined
}

interface Part {
  /** Missing for a part that the client did not name. */
  name: string | undefined
  content: string | File
  size: number
}

/** The next part, with its content in memory. */
async function readPart(
  iterator: AsyncGenerator<any>,
): Promise<{ done: true; value?: undefined } | { done: false; value: Part }> {
  let part: any
  let bytes: Uint8Array<ArrayBuffer> | undefined
  try {
    const { done, value } = await iterator.next()
    if (done) {
      return { done: true }
    }
    part = value
    if (part.type === 'file') {
      bytes = await part.toBuffer()
    }
  } catch (error) {
    throw toClientError(error)
  }
  const name = part.fieldname as string | undefined
  if (bytes !== undefined) {
    const content = new File([bytes], part.filename ?? 'blob', { type: part.mimetype })
    return { done: false, value: { name, content, size: bytes.byteLength } }
  }
  if (part.fieldnameTruncated || part.valueTruncated) {
    // `@fastify/multipart` cuts a field at `limits.fieldSize` (or its name at
    // `limits.fieldNameSize`) and carries on. Half a value must not reach the
    // handler.
    throw new HttpException(413, 'request field too large')
  }
  // `@fastify/multipart` parses a part that says it is JSON. The server does
  // that for the fields whose schema asks for it.
  const content = typeof part.value === 'string' ? part.value : JSON.stringify(part.value)
  return { done: false, value: { name, content, size: Buffer.byteLength(content) } }
}

/**
 * `@fastify/multipart` raises a Fastify error with a 4xx status for a body
 * over one of its `limits`, and for others that a client got wrong. What its
 * parser cannot read is a plain error.
 */
function toClientError(error: unknown): unknown {
  const { code, statusCode } = (error ?? {}) as { code?: unknown; statusCode?: unknown }
  if (typeof code === 'string' && code.startsWith('FST_') && typeof statusCode === 'number') {
    return statusCode >= 400 && statusCode < 500
      ? new HttpException(statusCode, String((error as Error).message ?? ''), error)
      : error
  }
  return malformedMultipart(error)
}
