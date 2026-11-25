import { createMultipartCollector, ValidationError } from '@navios/server'

import type { RouteInput, SchemaLike } from '@navios/server'

import { readLimited } from './body-limit.mjs'

import type { BunEnvironment, BunServer } from './environment.mjs'

export function pathOf(url: string): string {
  // `url` is absolute: scheme://host/path?query
  const start = url.indexOf('/', url.indexOf('//') + 2)
  if (start < 0) {
    return '/'
  }
  const query = url.indexOf('?', start)
  return query < 0 ? url.slice(start) : url.slice(start, query)
}

function parseQuery(url: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
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

export class BunRouteInput implements RouteInput {
  readonly raw: BunEnvironment['raw']

  constructor(
    private readonly request: Request,
    readonly urlParams: Record<string, string>,
    server: BunServer | null,
    private readonly multipartSchema: SchemaLike | undefined,
    private readonly isMultipart: boolean,
    private readonly bodyLimit: number,
  ) {
    this.raw = { request, server }
  }

  get method(): string {
    return this.request.method
  }

  get path(): string {
    return pathOf(this.request.url)
  }

  header(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined
  }

  headers(): Headers {
    return this.request.headers
  }

  query(): unknown {
    return parseQuery(this.request.url)
  }

  async body(): Promise<unknown> {
    const contentType = this.request.headers.get('content-type') ?? ''
    // A declared length was checked before the pipeline ran, and the body
    // cannot be longer than it. Without one (chunked transfer encoding, or
    // `inject()`) the bytes are counted while they are read.
    const request = this.request.headers.has('content-length')
      ? this.request
      : await readLimited(this.request, this.bodyLimit)
    if (this.isMultipart || contentType.includes('multipart/form-data')) {
      const collector = createMultipartCollector(this.multipartSchema)
      const form = await request.formData()
      for (const [field, value] of form as unknown as Iterable<[string, string | File]>) {
        collector.add(field, value)
      }
      return collector.result()
    }
    if (contentType === '' || contentType.includes('json')) {
      const text = await request.text()
      if (text === '') {
        return undefined
      }
      try {
        return JSON.parse(text)
      } catch (error) {
        throw new ValidationError('body', [
          { message: `Malformed JSON body: ${(error as Error).message}` },
        ])
      }
    }
    return request.text()
  }

  signal(): AbortSignal {
    return this.request.signal
  }
}
