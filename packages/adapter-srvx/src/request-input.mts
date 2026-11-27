import { HttpException } from '@navios/server'
import {
  canonicalPath,
  incompleteBody,
  malformedMultipart,
  parseQuery,
} from '@navios/server/adapter'

import type { BodyPart, BodySource, RouteInput } from '@navios/server/adapter'
import type { NodeServerRequest } from 'srvx'

import type { SrvxEnvironment, SrvxRequest, SrvxServer } from './environment.mjs'

/** One request as the pipeline sees it. It is its own body source. */
export class SrvxRouteInput implements RouteInput, BodySource {
  readonly raw: SrvxEnvironment['raw']
  private requestUrl: string | undefined

  constructor(
    private readonly request: SrvxRequest,
    readonly urlParams: Record<string, string>,
    server: SrvxServer | null,
    readonly isEmpty: boolean,
    /** Whether reading the request counts its body, which only the request does. */
    private readonly isLimited: boolean,
    /** The address of a test request. */
    private readonly address: string | undefined,
  ) {
    this.raw = { request, server }
  }

  get method(): string {
    return this.request.method
  }

  get path(): string {
    return canonicalPath(this.url())
  }

  url(): string {
    return (this.requestUrl ??= requestUrl(this.request))
  }

  remoteAddress(): string | undefined {
    // On Cloudflare, the address of a request without the header is `null`.
    return this.address ?? this.request.ip ?? undefined
  }

  header(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined
  }

  headers(): Headers {
    return this.request.headers
  }

  query(): unknown {
    const url = this.url()
    const index = url.indexOf('?')
    return parseQuery(index < 0 ? '' : url.slice(index + 1))
  }

  // A declared length was checked before the pipeline ran, and the body cannot
  // be longer than it. Without one, reading the request fails with a 413 once
  // the body is over the limit.

  get body(): BodySource {
    return this
  }

  get contentType(): string | undefined {
    return this.header('content-type')
  }

  async bytes(): Promise<Uint8Array> {
    const { request } = this
    const node = request.runtime?.node?.req
    if (node !== undefined && !this.isLimited && !request.bodyUsed && !('rawBody' in node)) {
      // The request of srvx makes a web stream of the one of Node to read bytes.
      return readNodeBody(node)
    }
    try {
      // Not every runtime has `bytes()`.
      return request.bytes === undefined
        ? new Uint8Array(await request.arrayBuffer())
        : await request.bytes()
    } catch (error) {
      throw this.unreadable(error) ?? error
    }
  }

  async parts(): Promise<BodyPart[]> {
    let form: FormData
    try {
      form = await this.request.formData()
    } catch (error) {
      throw this.unreadable(error) ?? malformedMultipart(error)
    }
    return Array.from(form, ([name, value]) => ({ name, value }))
  }

  private unreadable(error: unknown): unknown {
    if (error instanceof HttpException) {
      return error
    }
    if (this.request.signal.aborted) {
      // The client left before it had sent all of it.
      return incompleteBody(error)
    }
    return undefined
  }

  signal(): AbortSignal {
    return this.request.signal
  }
}

/** The body of a request of Node, which has not been read. */
function readNodeBody(request: NodeServerRequest): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const settle = () => {
      request.off('data', onData).off('end', onEnd).off('error', onGone).off('close', onGone)
    }
    const onData = (chunk: Buffer) => void chunks.push(chunk)
    const onEnd = () => {
      settle()
      resolve(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks))
    }
    // The client left before it had sent all of it.
    const onGone = (error?: Error) => {
      settle()
      reject(incompleteBody(error))
    }
    request.on('data', onData).once('end', onEnd).once('error', onGone).once('close', onGone)
  })
}

/** What srvx puts in the place of a `Host` header that is not valid, on Node. */
const INVALID_HOST = /^https?:\/\/_invalid_\//

/** The path and the query of an absolute url. */
function targetOf(url: string): string {
  return url.slice(url.indexOf('/', url.indexOf('://') + 3))
}

/**
 * The url of a request, without a host that the request did not name. On
 * Node, srvx fills in the address of the server for a request without a
 * `Host` header, and a placeholder for a header that is not valid. Deno fills
 * in `localhost` and the port of the server.
 */
function requestUrl(request: SrvxRequest): string {
  const { url } = request
  const node = request.runtime?.node?.req
  if (node === undefined) {
    const deno = request.runtime?.deno
    if (deno !== undefined && !request.headers.get('host')) {
      const port = (deno as { server?: { addr?: { port?: number } } }).server?.addr?.port
      const filled = new RegExp(`^https?://localhost:${port}/`)
      return filled.test(url) ? targetOf(url) : url
    }
    return url
  }
  const target = node.url ?? ''
  if (!target.startsWith('/')) {
    return url
  }
  const { headers } = node
  const isNamed =
    Boolean(headers.host) || Boolean(headers[':authority']) || 'x-forwarded-host' in headers
  return isNamed && !INVALID_HOST.test(url) ? url : target
}
