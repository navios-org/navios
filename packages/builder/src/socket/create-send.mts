import { isPendingOutcome, validateEager } from '../shared/validate.mjs'

import type { ValidationOutcome } from '../shared/validate.mjs'

import { reportSocketError } from './report-socket-error.mjs'

import type { SocketClient } from './socket-client.mjs'
import type { SocketError, SocketErrorInit } from './socket-error.mjs'
import type { SendHandler } from './socket-handlers.mjs'
import type { MessageFormatter, SendOptions, SocketBuilderConfig } from './socket-options.mjs'

/**
 * Default message formatter using Socket.IO array format.
 *
 * Format: [topic, payload] or [topic, payload, ackId]
 */
export const defaultFormatMessage: MessageFormatter = (topic, payload, ackId) => {
  return ackId ? [topic, payload, ackId] : [topic, payload]
}

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
  timeoutId: ReturnType<typeof setTimeout>
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
  const formatMessage = config.formatMessage ?? defaultFormatMessage
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
  function transmit(client: SocketClient, payload: unknown, ackId?: string): SocketError | null {
    try {
      const message = ackId ? formatMessage(topic, payload, ackId) : formatMessage(topic, payload)
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
        client.off(ackTopic, ackHandler)
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

      const timeoutId = setTimeout(() => {
        release()
        reject(
          fail(client, {
            kind: 'ack-timeout',
            message: `Acknowledgement timeout for topic "${topic}" (ackId: ${ackId})`,
          }),
        )
      }, timeout)

      ackHandlers.set(ackId, { topic, resolve, reject, timeoutId, settle: ackHandler, release })

      // Listen for the acknowledgement, then send. If either throws, the send
      // never left: stop waiting now instead of reporting an ack-timeout later.
      let error: SocketError | null
      try {
        client.on(ackTopic, ackHandler)
        setupGlobalListener?.()
        error = null
      } catch (cause) {
        error = fail(client, {
          kind: 'transport',
          message: `Failed to listen for the acknowledgement of "${topic}"; nothing was sent`,
          cause,
        })
      }
      error ??= transmit(client, validatedPayload, ackId)
      if (error) {
        release()
        reject(error)
      }
    })
  }

  const handler = ((payload: unknown) => {
    const client = getClient()

    const outcome: ValidationOutcome | Promise<ValidationOutcome> = payloadSchema
      ? validateEager(payloadSchema, payload)
      : { ok: true, value: payload }

    // Fire and forget: the call returns nothing, so a failure can only be
    // reported by throwing, and that has to happen before the call returns.
    if (!ackSchema) {
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
      return
    }

    // With an ack schema the call returns a promise, so an asynchronous
    // payloadSchema is awaited before the message is sent.
    if (isPendingOutcome(outcome)) {
      return outcome.then((resolved) => {
        if (!resolved.ok) {
          throw invalidPayload(client, payload, resolved)
        }
        return sendWithAck(client, resolved.value)
      })
    }
    if (!outcome.ok) {
      throw invalidPayload(client, payload, outcome)
    }
    return sendWithAck(client, outcome.value)
  }) as SendHandler<Options>

  // Attach config to handler
  handler.config = options

  return handler
}
