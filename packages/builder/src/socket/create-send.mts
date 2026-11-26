import { isPendingOutcome, validateEager } from '../shared/validate.mjs'

import type { ValidationOutcome } from '../shared/validate.mjs'

import { reportSocketError } from './report-socket-error.mjs'

import type { SocketClient } from './socket-client.mjs'
import type { SocketError, SocketErrorInit } from './socket-error.mjs'
import type { SendHandler } from './socket-handlers.mjs'
import type { MessageFormatter, SendOptions, SocketBuilderConfig } from './socket-options.mjs'

/**
 * Default message formatter using the array format.
 *
 * Format: [topic, payload] or [topic, payload, ackId]
 */
export const defaultFormatMessage: MessageFormatter = (topic, payload, ackId) => {
  return ackId ? [topic, payload, ackId] : [topic, payload]
}

/** What a timer can wait for. It fires at once for anything longer. */
/** The formatter of `topics: 'events'`: the payload is the event's argument. */
const passPayload: MessageFormatter = (_topic, payload) => payload

const MAX_TIMEOUT = 2 ** 31 - 1

/**
 * Generate a unique acknowledgement ID.
 */
function generateAckId(): string {
  // Use crypto.randomUUID if available, otherwise fallback to timestamp + random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `ack_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/** One acknowledgement the builder is still waiting for. */
export interface PendingAck {
  /** Topic of the send that is waiting. */
  topic: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  /** The timer of the `ackTimeout`, unless the acknowledgement is awaited without limit. */
  timeoutId: ReturnType<typeof setTimeout> | undefined
  /**
   * Validates the acknowledgement data and settles the send with it. Only the
   * first call for a pending acknowledgement has an effect, whichever way the
   * acknowledgement arrived.
   */
  settle: (ackData: unknown) => void
  /**
   * Stops waiting without settling: clears the timer, removes the
   * `__navios_ack:<id>` listener from the client it was registered on and
   * forgets the record.
   */
  release: () => void
}

export interface CreateSendContext {
  getClient: () => SocketClient
  config: SocketBuilderConfig
  ackHandlers: Map<string, PendingAck>
  /**
   * Makes sure the builder listens to the client's `'message'` event, so an
   * acknowledgement whose `ackId` comes out of `parseMessage` is seen.
   */
  setupGlobalListener?: () => void
}

/**
 * Creates a send handler for a specific topic.
 *
 * @param options - Send options including topic, payloadSchema, and optional ackSchema
 * @param context - Builder context with client getter and config
 * @returns Send handler function with attached config
 */
export function createSendHandler<Options extends SendOptions>(
  options: Options,
  context: CreateSendContext,
): SendHandler<Options> {
  const { topic, payloadSchema, ackSchema, ackTimeout: optionAckTimeout } = options
  const { getClient, config, ackHandlers, setupGlobalListener } = context
  const perTopicEvents = config.topics === 'events'
  const formatMessage =
    config.formatMessage ?? (perTopicEvents ? passPayload : defaultFormatMessage)
  const defaultTimeout = config.ackTimeout ?? 30000
  const timeout = optionAckTimeout ?? defaultTimeout

  /** Builds the error, reports it to `onError`, and hands it back to throw or reject with. */
  function fail(client: SocketClient, init: Omit<SocketErrorInit, 'topic' | 'url'>) {
    return reportSocketError(config.onError, { ...init, topic, url: client.url })
  }

  function invalidPayload(
    client: SocketClient,
    payload: unknown,
    outcome: Extract<ValidationOutcome, { ok: false }>,
  ) {
    return fail(client, {
      kind: 'validation',
      message: `Payload for "${topic}" failed validation; nothing was sent`,
      issues: outcome.issues,
      rawData: payload,
      cause: outcome.cause,
    })
  }

  /**
   * Formats and transmits one message. A client with `sendRaw` gets the
   * formatted message as it is; otherwise it goes through `emit`.
   *
   * Anything thrown by `formatMessage` or the client is reported and returned
   * as a `SocketError` of kind `transport`.
   */
  function transmit(
    client: SocketClient,
    payload: unknown,
    ack?: { id: string; callback: (data: unknown) => void },
  ): SocketError | null {
    try {
      if (perTopicEvents) {
        // One event per topic; an acknowledgement is the client's callback.
        const message = formatMessage(topic, payload)
        if (ack) client.emit(topic, message, ack.callback)
        else client.emit(topic, message)
        return null
      }
      const message = ack ? formatMessage(topic, payload, ack.id) : formatMessage(topic, payload)
      if (typeof client.sendRaw === 'function') {
        client.sendRaw(topic, message)
      } else {
        client.emit(topic, message)
      }
      return null
    } catch (cause) {
      return fail(client, {
        kind: 'transport',
        message: `Failed to send "${topic}"; nothing was sent`,
        cause,
      })
    }
  }

  /**
   * With `topics: 'events'` an acknowledgement arrives as the callback's
   * argument, encoded like any incoming message: `parseMessage` decodes it.
   */
  function decodeAck(ackData: unknown): unknown {
    if (!config.parseMessage) return ackData
    return config.parseMessage(ackData, topic)?.payload ?? ackData
  }

  function sendWithAck(client: SocketClient, validatedPayload: unknown): Promise<unknown> {
    const schema = ackSchema!
    return new Promise<unknown>((resolve, reject) => {
      const ackId = generateAckId()
      // Use reserved namespace to avoid collision with user-defined topics
      const ackTopic = `__navios_ack:${ackId}`

      // Stops waiting: timer, listener and record all go together
      const release = () => {
        clearTimeout(timeoutId)
        ackHandlers.delete(ackId)
        if (!perTopicEvents) client.off(ackTopic, ackHandler)
      }

      // Runs for an acknowledgement that arrives as a `__navios_ack:<id>` event
      // or as a parsed message carrying this ackId; only the first one counts.
      const ackHandler = (ackData: unknown) => {
        const pending = ackHandlers.get(ackId)
        if (!pending) {
          return
        }
        release()

        const settle = (outcome: ValidationOutcome) => {
          if (outcome.ok) {
            pending.resolve(outcome.value)
            return
          }
          pending.reject(
            fail(client, {
              kind: 'validation',
              message: `Acknowledgement for "${topic}" failed validation`,
              issues: outcome.issues,
              rawData: ackData,
              cause: outcome.cause,
            }),
          )
        }

        // An asynchronous ackSchema is awaited: the send promise is still pending.
        const outcome = validateEager(schema, ackData)
        if (isPendingOutcome(outcome)) {
          void outcome.then(settle)
        } else {
          settle(outcome)
        }
      }

      const giveUp = () => {
        release()
        reject(
          fail(client, {
            kind: 'ack-timeout',
            message: `Acknowledgement timeout for topic "${topic}" (ackId: ${ackId})`,
          }),
        )
      }
      const timeoutId = timeout > MAX_TIMEOUT ? undefined : setTimeout(giveUp, timeout)

      ackHandlers.set(ackId, { topic, resolve, reject, timeoutId, settle: ackHandler, release })

      // Listen for the acknowledgement, then send. If either throws, the send
      // never left: stop waiting now instead of reporting an ack-timeout later.
      let error: SocketError | null
      try {
        if (!perTopicEvents) client.on(ackTopic, ackHandler)
        setupGlobalListener?.()
        error = null
      } catch (cause) {
        error = fail(client, {
          kind: 'transport',
          message: `Failed to listen for the acknowledgement of "${topic}"; nothing was sent`,
          cause,
        })
      }
      error ??= transmit(client, validatedPayload, {
        id: ackId,
        callback: (ackData) => ackHandler(decodeAck(ackData)),
      })
      if (error) {
        release()
        reject(error)
      }
    })
  }

  const validatePayload = (payload: unknown): ValidationOutcome | Promise<ValidationOutcome> =>
    payloadSchema ? validateEager(payloadSchema, payload) : { ok: true, value: payload }

  // The call returns nothing, so a failure can only be reported by throwing,
  // and that has to happen before the call returns.
  function sendAndForget(payload: unknown): void {
    const client = getClient()
    const outcome = validatePayload(payload)
    if (isPendingOutcome(outcome)) {
      const message = `payloadSchema of "${topic}" validates asynchronously, which a send without ackSchema cannot wait for; nothing was sent. Use a synchronous schema or add an ackSchema`
      throw fail(client, { kind: 'validation', message, issues: [{ message }], rawData: payload })
    }
    if (!outcome.ok) {
      throw invalidPayload(client, payload, outcome)
    }
    const error = transmit(client, outcome.value)
    if (error) {
      throw error
    }
  }

  // The call returns a promise, so every failure rejects it, and an
  // asynchronous payloadSchema is awaited before the message is sent.
  async function sendForAck(payload: unknown): Promise<unknown> {
    const client = getClient()
    const pending = validatePayload(payload)
    const outcome = isPendingOutcome(pending) ? await pending : pending
    if (!outcome.ok) {
      throw invalidPayload(client, payload, outcome)
    }
    return sendWithAck(client, outcome.value)
  }

  const handler = (ackSchema ? sendForAck : sendAndForget) as SendHandler<Options>

  // Attach config to handler
  handler.config = options

  return handler
}
