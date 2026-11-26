import { create } from './client/create-navios.mjs'

import type { NaviosStatic } from './client/navios.mjs'

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
export type { Navios, NaviosStatic } from './client/navios.mjs'
export type { InterceptorManager } from './interceptors/interceptor-manager.mjs'
export type {
  NaviosAdapter,
  NaviosConfig,
  NaviosDefaults,
  NaviosResponseType,
} from './navios-config.mjs'
export type { HttpMethod } from './request/http-method.mjs'
export type { HeadersSource } from './request/merge-headers.mjs'
export type {
  NaviosBodyConfig,
  NaviosNoBodyConfig,
  NaviosRequestConfig,
  PreparedRequestConfig,
} from './request/request-config.mjs'
export type { NaviosResponse } from './response/navios-response.mjs'
