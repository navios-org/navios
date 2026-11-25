import { create } from './client/index.mjs'

import type { NaviosStatic } from './client/index.mjs'

const navios = create()

// Default methods
export const get = navios.get
export const post = navios.post
export const head = navios.head
export const options = navios.options
export const put = navios.put
export const patch = navios.patch
export const del = navios.delete

// @ts-ignore This is a hack to make the default handler work as a function and as an object
const defaultHandler: NaviosStatic = navios.request

defaultHandler.create = create
for (const method of ['get', 'post', 'head', 'options', 'put', 'patch', 'delete']) {
  // @ts-ignore
  defaultHandler[method] = navios[method]
}
export { create }

export default defaultHandler

export { NaviosError, NaviosInternalError } from './navios-error.mjs'
export type { Navios, NaviosStatic } from './client/index.mjs'
export type { NaviosConfig } from './navios-config.mjs'
export type {
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
