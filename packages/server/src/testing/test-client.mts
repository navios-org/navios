import type { BaseEndpointOptions, ClientRequestArgs } from '@navios/builder'

import { isJsonType, mediaType } from '../decoding/media-type.mjs'
import { compileRequestPath, compileRoutePath } from '../routing/route-path.mjs'

import type { TestResponse } from '../adapter/test-request.mjs'
import type { NaviosApplication } from '../application/navios-application.mjs'
import type { EndpointDeclaration } from '../handlers/endpoint-declaration.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TestClientOptions {
  /** Headers sent with every request. */
  headers?: Record<string, string>
  /** Path prefix, when the application has a global prefix. */
  prefix?: string
}

type CallArgs<Config extends BaseEndpointOptions> = ClientRequestArgs<Config> & {
  headers?: Record<string, string>
}

export type TestClient = <const Config extends BaseEndpointOptions>(
  endpoint: EndpointDeclaration<Config>,
  ...args: {} extends ClientRequestArgs<Config>
    ? [args?: CallArgs<Config>]
    : [args: CallArgs<Config>]
) => Promise<TestResponse>

function appendQuery(search: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQuery(search, key, item)
    }
    return
  }
  search.append(key, toText(value))
}

/** As clients of the builder write it: a date as its ISO form, other objects as JSON. */
function toText(value: unknown): string {
  if (typeof value !== 'object') {
    return String(value)
  }
  return value instanceof Date ? value.toISOString() : JSON.stringify(value)
}

function toFormData(data: object): FormData {
  if (data instanceof FormData) {
    return data
  }
  const form = new FormData()
  for (const [key, value] of Object.entries(data)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item instanceof Blob) {
        form.append(key, item)
      } else if (item !== undefined) {
        form.append(key, item === null ? '' : toText(item))
      }
    }
  }
  return form
}

/** A body as the builder hands it to a client, which sends any value but these as JSON. */
function toBody(endpoint: BaseEndpointOptions, data: unknown, headers: Headers): unknown {
  if (endpoint.body === 'multipart') {
    return toFormData((data ?? {}) as object)
  }
  if (data === undefined || (typeof data === 'object' && data !== null)) {
    return data
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  } else if (!isJsonType(mediaType(headers.get('content-type')!) ?? '')) {
    return data
  }
  return JSON.stringify(data)
}

function requestPath(
  { method, url }: BaseEndpointOptions,
  values: Record<string, unknown> = {},
): string {
  const path = compileRoutePath(url)
  const urlParams: Record<string, string> = {}
  for (const name of path.params) {
    const value = values[name]
    if (value === undefined) {
      throw new Error(`[Navios] Missing url param "${name}" for ${method} ${url}`)
    }
    urlParams[name] = String(value)
  }
  return compileRequestPath(path)(urlParams)
}

/**
 * Creates a function that calls builder endpoints against an application in
 * process. Arguments are typed from the endpoint declaration.
 *
 * ```ts
 * const call = createTestClient(app)
 * const response = await call(getUser, { urlParams: { id: '1' } })
 * expect(response.status).toBe(200)
 * ```
 */
export function createTestClient(
  app: Pick<NaviosApplication<any>, 'inject'>,
  options: TestClientOptions = {},
): TestClient {
  return ((endpoint: EndpointDeclaration, args: any = {}) => {
    const { config } = endpoint
    let path = config.url === '' ? '' : requestPath(config, args.urlParams)
    if (args.params) {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(args.params)) {
        appendQuery(search, key, value)
      }
      const query = search.toString()
      if (query) {
        path += `?${query}`
      }
    }
    const headers = new Headers(options.headers)
    for (const [name, value] of Object.entries<string>(args.headers ?? {})) {
      headers.set(name, value)
    }
    const body = toBody(config, args.data, headers)
    return app.inject({
      method: config.method,
      url: `${options.prefix ?? ''}${path}`,
      headers: Object.fromEntries(headers),
      body,
    })
  }) as TestClient
}
