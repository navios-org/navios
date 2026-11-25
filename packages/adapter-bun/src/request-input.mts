import { HttpException } from '@navios/server'
import { canonicalPath, malformedMultipart } from '@navios/server/adapter'

import type { BodyPart, BodySource, RouteInput } from '@navios/server/adapter'

import type { BunEnvironment, BunServer } from './environment.mjs'

function parseQuery(url: string): Record<string, string | string[]> {
  // Without a prototype, as the query of the Fastify adapter: `constructor`
  // and `__proto__` are keys like any other.
  const result: Record<string, string | string[]> = Object.create(null)
  const index = url.indexOf('?')
  if (index < 0) {
    return result
  }
  for (const [key, value] of new URLSearchParams(url.slice(index + 1))) {
    const existing = result[key]
    if (existing === undefined) {
      result[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      result[key] = [existing, value]
    }
  }
  return result
}

/** One request as the pipeline sees it. It is its own body source. */
export class BunRouteInput implements RouteInput, BodySource {
  readonly raw: BunEnvironment['raw']
  /** Whether the request has become a WebSocket. Set if the server takes any. */
  responded: (() => boolean) | undefined
  private requestUrl: string | undefined

  constructor(
    private readonly request: Request,
    readonly urlParams: Record<string, string>,
    private readonly server: BunServer | null,
    readonly isEmpty: boolean,
    /** The address of a test request, or the one of the connection once it has been read. */
    private address: string | undefined,
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
    return (this.requestUrl ??= this.request.url)
  }

  remoteAddress(): string | undefined {
    return (this.address ??= this.server?.requestIP(this.request)?.address)
  }

  /**
   * Reads what Bun computes from the native request on first access, which
   * fails once that request is gone: the url and the headers, and the address
   * for a response that is sent while the handler has long returned.
   */
  keep(isStream: boolean): void {
    this.url()
    void this.request.headers
    if (isStream) {
      this.remoteAddress()
    }
  }

  header(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined
  }

  headers(): Headers {
    return this.request.headers
  }

  query(): unknown {
    return parseQuery(this.url())
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
    try {
      return await this.request.bytes()
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
    const parts: BodyPart[] = []
    for (const [name, value] of form as unknown as Iterable<[string, string | File]>) {
      parts.push({ name, value })
    }
    return parts
  }

  private unreadable(error: unknown): unknown {
    if (error instanceof HttpException) {
      return error
    }
    if (this.request.signal.aborted) {
      // The client left before it had sent all of it.
      return new HttpException(400, 'The request body is incomplete', error)
    }
    return undefined
  }

  respondedStatus(): number {
    return 101
  }

  signal(): AbortSignal {
    return this.request.signal
  }
}
