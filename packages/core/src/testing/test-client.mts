import type { BaseEndpointOptions, ClientRequestArgs } from '@navios/builder'

import type { TestResponse } from '../adapter/http-adapter.mjs'
import type { EndpointDeclaration } from '../decorators/handler-types.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TestClientOptions {
  /** Headers sent with every request. */
  headers?: Record<string, string>
  /** Path prefix, when the application has a global prefix. */
  prefix?: string
}

export interface Injectable_ {
  inject(request: {
    method: string
    url: string
    headers?: Record<string, string>
    body?: unknown
  }): Promise<TestResponse>
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
  search.append(key, String(value))
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
export function createTestClient(app: Injectable_, options: TestClientOptions = {}): TestClient {
  return ((endpoint: EndpointDeclaration, args: any = {}) => {
    const { config } = endpoint
    let path = config.url.replace(/\$([^/]+)/g, (_match, name: string) => {
      const value = args.urlParams?.[name]
      if (value === undefined) {
        throw new Error(`[Navios] Missing url param "${name}" for ${config.method} ${config.url}`)
      }
      return encodeURIComponent(String(value))
    })
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
    return app.inject({
      method: config.method,
      url: `${options.prefix ?? ''}${path}`,
      headers: { ...options.headers, ...args.headers },
      body: args.data,
    })
  }) as TestClient
}
