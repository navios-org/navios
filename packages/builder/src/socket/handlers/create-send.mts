import type { ZodType } from 'zod/v4'

import type { SocketClient } from '../types/socket-client.mjs'
import type { MessageFormatter, SendOptions, SocketBuilderConfig } from '../types/socket-options.mjs'
import type { SendHandler } from '../types/socket-handlers.mjs'

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

export interface CreateSendContext {
  getClient: () => SocketClient
  config: SocketBuilderConfig
  ackHandlers: Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeoutId: ReturnType<typeof setTimeout>
  }>
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

  const handler = ((payload: unknown) => {
    const client = getClient()

    // Validate payload if schema provided
    let validatedPayload = payload
    if (payloadSchema) {
      validatedPayload = (payloadSchema as ZodType).parse(payload)
    }

    // If no ack schema, fire and forget
    if (!ackSchema) {
      const message = formatMessage(topic, validatedPayload)
      client.emit(topic, message)
      return
    }

    // With ack schema, return a Promise
    return new Promise<unknown>((resolve, reject) => {
      const ackId = generateAckId()
      // Use reserved namespace to avoid collision with user-defined topics
      const ackTopic = `__navios_ack:${ackId}`

      // Define the ack handler first so we can reference it in timeout cleanup
      const ackHandler = (ackData: unknown) => {
        const pending = ackHandlers.get(ackId)
        if (pending) {
          clearTimeout(pending.timeoutId)
          ackHandlers.delete(ackId)
          client.off(ackTopic, ackHandler)

          try {
            // Validate ack response if schema provided
            const validatedAck = (ackSchema as ZodType).parse(ackData)
            pending.resolve(validatedAck)
          } catch (error) {
            config.onValidationError?.(error, ackTopic, ackData)
            pending.reject(error as Error)
          }
        }
      }

      // Set up timeout with proper cleanup of the specific handler
      const timeoutId = setTimeout(() => {
        ackHandlers.delete(ackId)
        client.off(ackTopic, ackHandler) // Remove specific handler to prevent leak
        config.onAckTimeout?.(topic, ackId)
        reject(new Error(`Acknowledgement timeout for topic "${topic}" (ackId: ${ackId})`))
      }, timeout)

      // Store handler for cleanup
      ackHandlers.set(ackId, { resolve, reject, timeoutId })

      // Listen for acknowledgement
      client.on(ackTopic, ackHandler)

      // Send message with ackId
      const message = formatMessage(topic, validatedPayload, ackId)
      client.emit(topic, message)
    })
  }) as SendHandler<Options>

  // Attach config to handler
  handler.config = options

  return handler
}
