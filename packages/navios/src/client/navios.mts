import type { InterceptorManager } from '../interceptors/interceptor-manager.mjs'
import type { NaviosConfig, NaviosDefaults } from '../navios-config.mjs'
import type {
  NaviosBodyConfig,
  NaviosNoBodyConfig,
  NaviosRequestConfig,
  PreparedRequestConfig,
} from '../request/request-config.mjs'
import type { NaviosResponse } from '../response/navios-response.mjs'

export interface Navios {
  /**
   * Creates a client that starts from the `defaults` of this one, as they are
   * now: `baseConfig` is merged over them, headers by name. Interceptors are
   * not copied.
   */
  create: (baseConfig?: NaviosConfig) => Navios
  get: <Result, Params extends object = object>(
    url: string,
    config?: NaviosNoBodyConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  post: <Result, Data = unknown, Params extends object = object>(
    url: string,
    data?: Data,
    config?: NaviosBodyConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  put: <Result, Data = unknown, Params extends object = object>(
    url: string,
    data?: Data,
    config?: NaviosBodyConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  delete: <Result, Params extends object = object>(
    url: string,
    config?: NaviosBodyConfig<unknown, Params>,
  ) => Promise<NaviosResponse<Result>>
  patch: <Result, Data = unknown, Params extends object = object>(
    url: string,
    data?: Data,
    config?: NaviosBodyConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  head: <Result, Params extends object = object>(
    url: string,
    config?: NaviosNoBodyConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  options: <Result, Params extends object = object>(
    url: string,
    config?: NaviosNoBodyConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  request: <Result, Data = unknown, Params extends object = object>(
    config: NaviosRequestConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  /** The configuration of the client. Changes apply to every later request. */
  defaults: NaviosDefaults
  interceptors: {
    /** Run before the request is serialised, so they can change `params`, `data` and `headers`. */
    request: InterceptorManager<PreparedRequestConfig>
    /** Run after the body was read. */
    response: InterceptorManager<NaviosResponse<unknown>>
  }
}

export interface NaviosStatic extends Navios {
  <Result, Data = unknown, Params extends object = object>(
    config: NaviosRequestConfig<Data, Params>,
  ): Promise<NaviosResponse<Result>>
}
