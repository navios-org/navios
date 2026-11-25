import { STATUS_CODES } from 'node:http'
import type { Socket } from 'node:net'

import { problem } from '@navios/server'
import { encodeResult } from '@navios/server/adapter'

const STATUSES: Record<string, number | undefined> = {
  ERR_HTTP_REQUEST_TIMEOUT: 408,
  HPE_HEADER_OVERFLOW: 431,
}

/** Answers what Node cannot read as a request. */
export function answerClientError(error: Error & { code?: string }, socket: Socket): void {
  if (error.code === 'ECONNRESET' || socket.destroyed) {
    return
  }
  if (socket.writable) {
    const status = STATUSES[error.code ?? ''] ?? 400
    const { headers, body } = encodeResult(problem(status))
    socket.write(
      `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n` +
        `content-type: ${headers['content-type']}\r\n` +
        `content-length: ${Buffer.byteLength(body as string)}\r\n` +
        `connection: close\r\n\r\n${body as string}`,
    )
  }
  socket.destroy(error)
}
