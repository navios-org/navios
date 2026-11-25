export interface NaviosConfig {
  adapter?: typeof globalThis.fetch
  baseURL?: string
  validateStatus?: (status: number) => boolean
  headers?: { [key: string]: string }
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'stream'
  FormData?: any
  URLSearchParams?: any
}
