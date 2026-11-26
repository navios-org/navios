import type { SocketClient } from './socket-client.mjs'
import type { MessageFormatter, MessageParser, SocketBuilderConfig } from './socket-options.mjs'

/** An acknowledgement a send waits for. */
export interface AwaitedAck {
  id: string
  /** Settles the send with the acknowledgement's data. Only the first call counts. */
  settle: (data: unknown) => void
}

/**
 * How messages travel over the client: everything `topics` decides, chosen once
 * per builder. `formatMessage` and `parseMessage` of the config are in it.
 */
export interface SocketTransport {
  /** Parses an incoming message, and with `topics: 'events'` an acknowledgement. */
  parse: MessageParser
  /**
   * The one event every message arrives with, `'message'` for the envelope.
   * `undefined` when each topic is an event of its own, listened to while it
   * has subscribers.
   */
  messageEvent: string | undefined
  /**
   * Formats and sends one message, with `ack` when the send waits for an
   * acknowledgement. Throws what `formatMessage` or the client throws.
   */
  send(client: SocketClient, topic: string, payload: unknown, ack?: AwaitedAck): void
  /**
   * Listens on the client for the acknowledgement of a send, besides a parsed
   * message that carries its `ackId`.
   *
   * @returns The function that stops listening
   */
  listenAck(client: SocketClient, ack: AwaitedAck): () => void
}

/**
 * Default message formatter using the array format.
 *
 * Format: [topic, payload] or [topic, payload, ackId]
 */
const formatEnvelope: MessageFormatter = (topic, payload, ackId) =>
  ackId ? [topic, payload, ackId] : [topic, payload]

/**
 * Default message parser for the array format.
 *
 * Expected format: [topic, payload] or [topic, payload, ackId]
 */
const parseEnvelope: MessageParser = (data) => {
  if (Array.isArray(data) && data.length >= 2 && typeof data[0] === 'string') {
    return {
      topic: data[0],
      payload: data[1],
      ackId: typeof data[2] === 'string' ? data[2] : undefined,
    }
  }
  return null
}

/** `topics: 'envelope'`: every message is one `message` event whose data names its topic. */
function envelope(config: SocketBuilderConfig): SocketTransport {
  const format = config.formatMessage ?? formatEnvelope
  return {
    parse: config.parseMessage ?? parseEnvelope,
    messageEvent: 'message',
    send(client, topic, payload, ack) {
      const message = ack ? format(topic, payload, ack.id) : format(topic, payload)
      // A client with `sendRaw` gets the formatted message as it is
      if (typeof client.sendRaw === 'function') {
        client.sendRaw(topic, message)
      } else {
        client.emit(topic, message)
      }
    },
    listenAck(client, { id, settle }) {
      // A reserved namespace, so that no topic of the user collides with it
      const event = `__navios_ack:${id}`
      client.on(event, settle)
      return () => client.off(event, settle)
    },
  }
}

/**
 * `topics: 'events'`: each topic is an event of its own, as in Socket.IO. The
 * payload is the event's argument, and an acknowledgement the argument of the
 * callback passed to `emit`.
 */
function events({ formatMessage, parseMessage }: SocketBuilderConfig): SocketTransport {
  return {
    parse: parseMessage ?? ((data, event) => ({ topic: event, payload: data })),
    messageEvent: undefined,
    send(client, topic, payload, ack) {
      const message = formatMessage ? formatMessage(topic, payload) : payload
      if (!ack) {
        client.emit(topic, message)
        return
      }
      // The acknowledgement is encoded like any incoming message: `parseMessage` decodes it
      client.emit(topic, message, (data: unknown) =>
        ack.settle(parseMessage ? (parseMessage(data, topic)?.payload ?? data) : data),
      )
    },
    listenAck: () => () => {},
  }
}

/** The transport `topics` asks for. */
export function socketTransport(config: SocketBuilderConfig): SocketTransport {
  return config.topics === 'events' ? events(config) : envelope(config)
}
