import { HttpClientError } from '../http-client-error.mjs'
import { createInterceptorChain } from '../interceptors/interceptor-manager.mjs'
import { buildInit } from '../request/build-init.mjs'
import { buildUrl } from '../request/build-url.mjs'
import { copyPlain } from '../request/copy-plain.mjs'
import { headerRecord } from '../request/merge-headers.mjs'
import { startDeadline } from '../request/start-deadline.mjs'
import { parseJsonBody, readBody, readErrorBody } from '../response/read-body.mjs'

import type { NaviosConfig, NaviosDefaults } from '../navios-config.mjs'
import type { NaviosRequestConfig, PreparedRequestConfig } from '../request/request-config.mjs'
import type { NaviosResponse } from '../response/navios-response.mjs'

import type { Navios } from './navios.mjs'

/** A copy without the keys that are `undefined`, which must not replace a default. */
function defined<T extends object>(source: T): T {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as T
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The axios code of a request that was cut short. */
function abortCode(
  error: unknown,
  signal: AbortSignal | null | undefined,
  expired: boolean,
): string | undefined {
  const name = (error as Error | null | undefined)?.name
  if (expired || name === 'TimeoutError') return 'ECONNABORTED'
  return name === 'AbortError' || signal?.aborted ? 'ERR_CANCELED' : undefined
}

export function create(baseConfig: NaviosConfig = {}): Navios {
  const defaults: NaviosDefaults = {
    validateStatus: (status) => status >= 200 && status < 300,
    responseType: 'json',
    ...defined(baseConfig),
    headers: headerRecord(baseConfig.headers),
  }
  const requestInterceptors = createInterceptorChain<PreparedRequestConfig>()
  const responseInterceptors = createInterceptorChain<NaviosResponse<unknown>>()

  function prepare(config: NaviosRequestConfig): PreparedRequestConfig {
    const { adapter: _adapter, ...base } = defaults
    const prepared = {
      method: 'GET',
      url: '',
      baseURL: '',
      ...defined(base),
      ...defined(config),
      headers: headerRecord(defaults.headers, config.headers),
    } as PreparedRequestConfig
    prepared.params = copyPlain(prepared.params)
    prepared.data = copyPlain(prepared.data)
    return prepared
  }

  async function send(config: PreparedRequestConfig): Promise<NaviosResponse<unknown>> {
    let url: string
    let init: RequestInit
    try {
      // An interceptor may have put any other object in the place of the record
      config.headers = headerRecord(config.headers)
      url = buildUrl(config)
      init = buildInit(config)
    } catch (cause) {
      const message = `The request could not be built: ${messageOf(cause)}`
      throw new HttpClientError(message, { config, code: 'ERR_BAD_OPTION_VALUE', cause })
    }

    const deadline = startDeadline(config)
    if (deadline.signal) init.signal = deadline.signal
    try {
      // Looked up now, so that a `fetch` that was patched later is the one used
      const adapter = defaults.adapter ?? globalThis.fetch
      const response = await read(await adapter(url, init), config)
      if (config.responseType === 'stream') response.data = deadline.followBody(response.data)
      return response
    } catch (cause) {
      if (cause instanceof HttpClientError) throw cause
      const code = abortCode(cause, config.signal, deadline.expired())
      throw new HttpClientError(messageOf(cause), { config, code, cause })
    } finally {
      deadline.release()
    }
  }

  async function read(res: Response, config: PreparedRequestConfig) {
    const response: NaviosResponse<unknown> = {
      data: undefined,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    }

    if (!config.validateStatus(res.status)) {
      response.data = await readErrorBody(res)
      const reason = res.statusText ? ` (${res.statusText})` : ''
      throw new HttpClientError(`Request failed with status ${res.status}${reason}`, {
        config,
        response,
      })
    }

    if (config.responseType !== 'json') {
      response.data = await readBody(res, config.responseType)
      return response
    }
    // A connection that breaks while the text is read is a failure without a
    // response. A text that is not JSON is one with a response: the server
    // answered, but not with what `responseType` asks for.
    const text = await res.text()
    try {
      response.data = parseJsonBody(text)
    } catch (cause) {
      response.data = text
      throw new HttpClientError(`Response body is not valid JSON: ${messageOf(cause)}`, {
        config,
        response,
        cause,
      })
    }
    return response
  }

  async function request<Result>(config: NaviosRequestConfig): Promise<NaviosResponse<Result>> {
    const prepared = prepare(config)
    const sent = requestInterceptors.run(Promise.resolve(prepared)).then((intercepted) => {
      // An `onRejected` that does not rethrow
      if (typeof intercepted !== 'object' || intercepted === null) {
        const message = 'The request could not be built: an interceptor returned no config'
        throw new HttpClientError(message, { config: prepared, code: 'ERR_BAD_OPTION_VALUE' })
      }
      return send(intercepted)
    })
    return (await responseInterceptors.run(sent)) as NaviosResponse<Result>
  }

  return {
    create,
    request,
    get: (url, config) => request({ ...config, url, method: 'GET' }),
    post: (url, data, config) => request({ ...config, url, method: 'POST', data }),
    head: (url, config) => request({ ...config, url, method: 'HEAD' }),
    options: (url, config) => request({ ...config, url, method: 'OPTIONS' }),
    put: (url, data, config) => request({ ...config, url, method: 'PUT', data }),
    patch: (url, data, config) => request({ ...config, url, method: 'PATCH', data }),
    delete: (url, config) => request({ ...config, url, method: 'DELETE' }),
    defaults,
    interceptors: { request: requestInterceptors, response: responseInterceptors },
  }
}
