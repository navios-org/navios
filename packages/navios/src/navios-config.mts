import type { HeadersSource } from './request/merge-headers.mjs'

export type NaviosResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'stream'

/** What performs a request. Any `fetch` implementation fits. */
export type NaviosAdapter = (url: string, init: RequestInit) => Promise<Response>

export interface NaviosConfig {
  /**
   * Performs the requests.
   * @default the global `fetch`, looked up for every request
   */
  adapter?: NaviosAdapter
  baseURL?: string
  /** @default any status from 200 to 299 */
  validateStatus?: (status: number) => boolean
  /** Headers of every request. A header of the request replaces one of the same name. */
  headers?: HeadersSource
  /** @default 'json' */
  responseType?: NaviosResponseType
  /** The class `params` are written with. @default the global `URLSearchParams` */
  URLSearchParams?: new () => { append(name: string, value: string): void; toString(): string }
}

/** The configuration of a client. Changes apply to every later request. */
export interface NaviosDefaults extends NaviosConfig {
  /** Names are listed in lower case, and read, set and deleted in any. */
  headers: Record<string, string>
  validateStatus: (status: number) => boolean
  responseType: NaviosResponseType
}
