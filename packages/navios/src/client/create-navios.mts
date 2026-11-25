import { createInterceptorManager } from '../interceptors/index.mjs'
import { NaviosError, NaviosInternalError } from '../navios-error.mjs'
import { processResponseBody } from '../response/index.mjs'

import type { NaviosConfig } from '../navios-config.mjs'
import type { NaviosRequestConfig, PreparedRequestConfig } from '../request/request-config.mjs'
import type { NaviosResponse } from '../response/navios-response.mjs'

import type { Navios } from './navios.mjs'

/** The axios codes for a request that was cut short, by the name of the abort reason. */
const ABORT_CODES: Record<string, string> = {
  TimeoutError: 'ECONNABORTED',
  AbortError: 'ERR_CANCELED',
}

function isAbort(err: unknown): boolean {
  return (err as Error | undefined)?.name !== undefined && (err as Error).name in ABORT_CODES
}

/** One signal that aborts, with the same reason, as soon as any of `signals` does. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) {
    return signals[0]!
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals)
  }
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

/** Turns `timeout` into a signal, combined with the one the caller gave. */
function withTimeout<Config extends PreparedRequestConfig<any, any>>(config: Config): Config {
  const { timeout, signal } = config
  if (typeof timeout !== 'number' || !(timeout > 0)) {
    return config
  }
  const timeoutSignal = AbortSignal.timeout(timeout)
  return { ...config, signal: signal ? anySignal([signal, timeoutSignal]) : timeoutSignal }
}

export function create(baseConfig: NaviosConfig = {}): Navios {
  const adapter = baseConfig.adapter ?? fetch
  const normalizedBaseConfig: Omit<Required<NaviosConfig>, 'adapter'> = {
    baseURL: baseConfig.baseURL ?? '',
    validateStatus:
      baseConfig.validateStatus ??
      ((status: number) => {
        return status >= 200 && status < 300 // default
      }),
    headers: baseConfig.headers ?? {},
    responseType: baseConfig.responseType || 'json',
    FormData: baseConfig.FormData ?? FormData,
    URLSearchParams: baseConfig.URLSearchParams ?? URLSearchParams,
  }
  const hooks = createInterceptorManager()

  async function tryRecoverFromError(
    err: unknown,
    config: PreparedRequestConfig<any, any>,
    type: 'request' | 'response',
    response: Response | NaviosResponse<any> | null = null,
  ) {
    const error = new NaviosInternalError(
      (err as Error)?.message ?? 'Unknown error',
      response,
      config,
    )
    error.cause = err
    const code = ABORT_CODES[(err as Error)?.name]
    if (code) {
      error.code = code
    }
    let isFixed = false
    let result: NaviosInternalError | NaviosResponse<any> = error
    for (const interceptor of hooks.interceptors[type].rejected.values()) {
      if (!isFixed) {
        try {
          result = await interceptor(result as NaviosInternalError)
          isFixed = true
          break
        } catch (err) {
          result = err as NaviosError
          result.config = config
        }
      }
    }
    if (!isFixed) {
      throw result
    }
    return result as NaviosResponse<any>
  }

  async function request<
    Result,
    Data = Result,
    Params extends Record<string, string | number> = {},
  >(config: NaviosRequestConfig<Data, Params>) {
    let finalConfig: PreparedRequestConfig<Data, Params> = {
      method: 'GET',
      // @ts-ignore
      params: {},
      ...normalizedBaseConfig,
      ...config,
      headers: {
        ...normalizedBaseConfig.headers,
        ...config.headers,
      },
      baseURL: '',
      url: config.url
        ? `${config.baseURL ?? normalizedBaseConfig.baseURL}${config.url}`
        : (config.baseURL ?? normalizedBaseConfig.baseURL),
    }
    for (const interceptor of hooks.interceptors.request.init.values()) {
      finalConfig = await interceptor(finalConfig)
    }
    finalConfig = withTimeout(finalConfig)
    let res: Response
    try {
      res = await adapter(finalConfig.url, finalConfig)
    } catch (err) {
      return (await tryRecoverFromError(err, finalConfig, 'request')) as NaviosResponse<Result>
    }
    const isSuccessful = finalConfig.validateStatus(res.status)
    if (isSuccessful) {
      const response: NaviosResponse<Result> = {
        data: undefined as Result,
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      }
      try {
        response.data = await processResponseBody(res, finalConfig)
      } catch (err) {
        // A timeout or an abort while the body was read is a transport failure
        if (isAbort(err)) {
          return (await tryRecoverFromError(err, finalConfig, 'request')) as NaviosResponse<Result>
        }
        // The server answered, but not with what `responseType` asks for: the
        // error keeps the response, with the text that was read as its data.
        response.data = (err as { body?: Result }).body as Result
        return (await tryRecoverFromError(
          err,
          finalConfig,
          'response',
          response,
        )) as NaviosResponse<Result>
      }

      for (const interceptor of hooks.interceptors.response.success.values()) {
        await interceptor(response)
      }
      return response as NaviosResponse<Result>
    }
    return (await tryRecoverFromError(
      new Error(`Request failed with ${res.statusText}`),
      finalConfig,
      'response',
      res,
    )) as NaviosResponse<Result>
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
    defaults: normalizedBaseConfig,
    // @ts-expect-error TS2322. First interceptor is fixing the type
    interceptors: hooks,
  }
}
