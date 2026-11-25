/**
 * One server-sent event.
 */
export interface SseMessage {
  /** Event name. Omitted for the default `message` event. */
  event?: string
  /** Sent as JSON unless it is a string. */
  data: unknown
  id?: string
  /** Reconnection delay in milliseconds. */
  retry?: number
}

/**
 * Serialises one event in the `text/event-stream` format.
 */
export function encodeSse(message: SseMessage): string {
  let out = ''
  if (message.id !== undefined) {
    out += `id: ${message.id}\n`
  }
  if (message.event !== undefined) {
    out += `event: ${message.event}\n`
  }
  if (message.retry !== undefined) {
    out += `retry: ${message.retry}\n`
  }
  const data = typeof message.data === 'string' ? message.data : JSON.stringify(message.data)
  for (const line of String(data).split('\n')) {
    out += `data: ${line}\n`
  }
  return `${out}\n`
}
