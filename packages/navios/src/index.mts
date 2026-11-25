import { create } from './client/index.mjs'

import type { NaviosStatic } from './client/index.mjs'

const client = /* @__PURE__ */ create()

// Default methods
export const get = client.get
export const post = client.post
export const head = client.head
export const options = client.options
export const put = client.put
export const patch = client.patch
export const del = client.delete

/** The default client: a function as well as a client. */
const navios: NaviosStatic = /* @__PURE__ */ Object.assign(client.request, client)

export { create }

export default navios

export { HttpClientError, isHttpClientError } from './http-client-error.mjs'
export type { HttpClientErrorInit } from './http-client-error.mjs'
export type { Navios, NaviosStatic } from './client/index.mjs'
export type { InterceptorManager } from './interceptors/index.mjs'
export type {
  NaviosAdapter,
  NaviosConfig,
  NaviosDefaults,
  NaviosResponseType,
} from './navios-config.mjs'
export type {
  HeadersSource,
  HttpMethod,
  NaviosDeleteConfig,
  NaviosGetConfig,
  NaviosHeadConfig,
  NaviosOptionsConfig,
  NaviosPatchConfig,
  NaviosPostConfig,
  NaviosPutConfig,
  NaviosRequestConfig,
  PreparedRequestConfig,
} from './request/index.mjs'
export type { NaviosPromise, NaviosResponse } from './response/index.mjs'
