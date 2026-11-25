/**
 * One server-sent event.
 */
export interface SseMessage {
  /** Event name. Omitted for the default `message` event. */
  event?: string
  /** Sent as JSON unless it is a string. `undefined` is sent as no text. */
  data: unknown
  id?: string
  /** Reconnection delay in milliseconds, a whole number. */
  retry?: number
}

const LINE_BREAK = /\r\n|\r|\n/

/** A field that cannot span lines: a line break in it would start another field. */
function singleLine(field: 'id' | 'event', value: string): string {
  const text = String(value)
  if (text.includes('\n') || text.includes('\r')) {
    throw new Error(`[Navios] The ${field} of a server-sent event cannot contain a line break.`)
  }
  return text
}

/**
 * Serialises one event in the `text/event-stream` format. Throws when `id`
 * or `event` contains a line break, or when `retry` is not a whole number.
 */
export function encodeSse(message: SseMessage): string {
  let out = ''
  if (message.id !== undefined) {
    out += `id: ${singleLine('id', message.id)}\n`
  }
  if (message.event !== undefined) {
    out += `event: ${singleLine('event', message.event)}\n`
  }
  if (message.retry !== undefined) {
    if (!Number.isInteger(message.retry) || message.retry < 0) {
      throw new Error(
        `[Navios] The retry of a server-sent event must be a whole number of milliseconds, ` +
          `not ${String(message.retry)}.`,
      )
    }
    out += `retry: ${message.retry}\n`
  }
  const data =
    typeof message.data === 'string' ? message.data : (JSON.stringify(message.data) ?? '')
  // A lone carriage return ends a line too, so it must start a `data:` line
  // and not a field of its own.
  for (const line of data.split(LINE_BREAK)) {
    out += `data: ${line}\n`
  }
  return `${out}\n`
}
