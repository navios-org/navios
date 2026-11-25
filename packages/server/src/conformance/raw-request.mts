import { connect } from 'node:net'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RawResponse {
  status: number
  /** The body, or `undefined` for one that is not JSON. */
  body: any
}

/**
 * Sends a request as it is written, which `fetch` would not: a target or a
 * `Host` that is not what it should be.
 * @internal
 */
export function rawRequest(
  base: string,
  target: string,
  options: { method?: string; host?: string; headers?: string[]; body?: string } = {},
): Promise<RawResponse> {
  const { hostname, port } = new URL(base)
  const { method = 'GET', host = 'localhost', headers = [], body = '' } = options
  const lines = [
    `${method} ${target} HTTP/1.1`,
    `Host: ${host}`,
    'Connection: close',
    ...headers,
    '',
    body,
  ]
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const socket = connect(Number(port), hostname, () => {
      socket.write(lines.join('\r\n'))
    })
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('error', reject)
    socket.on('close', () => {
      const text = Buffer.concat(chunks).toString()
      const json = text.slice(text.indexOf('\r\n\r\n') + 4)
      let parsed: unknown
      try {
        parsed = JSON.parse(json)
      } catch {
        parsed = undefined
      }
      resolve({ status: Number(text.slice(9, 12)), body: parsed })
    })
  })
}
