import { isJsonContentType } from '../is-json-content-type.mjs'

import type { NaviosResponseType } from '../navios-config.mjs'

/** Parses a body that is expected to be JSON. An empty one (a 204, ...) is `undefined`. */
export function parseJsonBody(text: string): unknown {
  return text === '' ? undefined : JSON.parse(text)
}

/** Reads a body as anything but JSON. */
export function readBody(
  response: Response,
  responseType: Exclude<NaviosResponseType, 'json'>,
): Promise<unknown> | ReadableStream | null {
  switch (responseType) {
    case 'blob':
      return response.blob()
    case 'arrayBuffer':
      return response.arrayBuffer()
    case 'formData':
      return response.formData()
    case 'stream':
      return response.body
    default:
      return response.text()
  }
}

/** Reads the body of an error response: parsed when it is JSON, whatever was asked for. */
export async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!isJsonContentType(response.headers.get('content-type'))) return text
  try {
    return parseJsonBody(text)
  } catch {
    // A malformed error body must not hide the status: the text is kept
    return text
  }
}
