import { isPendingOutcome, validateEager } from '../../request/validate.mjs'
import { reportSocketError } from '../report-error.mjs'

import type { SocketErrorInit } from '../../errors/socket-error.mjs'
import type { ValidationOutcome } from '../../request/validate.mjs'
import type { SocketClient } from '../types/socket-client.mjs'
import type { SendHandler } from '../types/socket-handlers.mjs'
import type {
  MessageFormatter,
  SendOptions,
  SocketBuilderConfig,
} from '../types/socket-options.mjs'

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
}

export interface CreateSendContext {
  getClient: () => SocketClient
  config: SocketBuilderConfig
  ackHandlers: Map<string, PendingAck>
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
  const { getClient, config, ackHandlers } = context
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

  function sendWithAck(client: SocketClient, validatedPayload: unknown): Promise<unknown> {
    const schema = ackSchema!
    return new Promise<unknown>((resolve, reject) => {
      const ackId = generateAckId()
      // Use reserved namespace to avoid collision with user-defined topics
      const ackTopic = `__navios_ack:${ackId}`

      // Define the ack handler first so we can reference it in timeout cleanup
      const ackHandler = (ackData: unknown) => {
        const pending = ackHandlers.get(ackId)
        if (!pending) {
          return
        }
        clearTimeout(pending.timeoutId)
        ackHandlers.delete(ackId)
        client.off(ackTopic, ackHandler)

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

      // Set up timeout with proper cleanup of the specific handler
      const timeoutId = setTimeout(() => {
        ackHandlers.delete(ackId)
        client.off(ackTopic, ackHandler) // Remove specific handler to prevent leak
        reject(
          fail(client, {
            kind: 'ack-timeout',
            message: `Acknowledgement timeout for topic "${topic}" (ackId: ${ackId})`,
          }),
        )
      }, timeout)

      // Store handler for cleanup
      ackHandlers.set(ackId, { topic, resolve, reject, timeoutId })

      // Listen for acknowledgement
      client.on(ackTopic, ackHandler)

      // Send message with ackId
      const message = formatMessage(topic, validatedPayload, ackId)
      client.emit(topic, message)
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
      client.emit(topic, formatMessage(topic, outcome.value))
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
