import { z, ZodType } from 'zod/v4'

export type MessagePattern = 'pubsub' | 'point-to-point' | 'request-reply'

/**
 * Base message configuration similar to BaseEndpointOptions but for messages.
 */
export interface BaseMessageConfig<
  Pattern extends MessagePattern = MessagePattern,
  PayloadSchema extends ZodType = ZodType,
  ResponseSchema extends ZodType = ZodType,
> {
  pattern: Pattern
  topic?: string // For pub/sub and request/reply
  queue?: string // For point-to-point
  payloadSchema: PayloadSchema
  responseSchema?: ResponseSchema // For request/reply
}

const zodSchema = (name: string) =>
  z.custom<ZodType>().refine((schema) => schema instanceof ZodType, {
    message: `${name} schema must be a Zod type`,
  })

export const pubsubMessageConfigSchema = z.object({
  pattern: z.literal('pubsub'),
  topic: z.string().min(1),
  payloadSchema: zodSchema('Payload'),
})

export const pointToPointMessageConfigSchema = z.object({
  pattern: z.literal('point-to-point'),
  queue: z.string().min(1),
  payloadSchema: zodSchema('Payload'),
})

export const requestReplyMessageConfigSchema = z.object({
  pattern: z.literal('request-reply'),
  topic: z.string().min(1),
  payloadSchema: zodSchema('Payload'),
  responseSchema: zodSchema('Response'),
})

/**
 * Message definition returned by message builder helper functions.
 */
export interface MessageDefinition<
  Pattern extends MessagePattern,
  PayloadSchema extends ZodType,
  ResponseSchema extends ZodType = never,
> {
  config: BaseMessageConfig<Pattern, PayloadSchema, ResponseSchema>
}

/** What `declarePubSub()` returns: a definition whose `topic` is known to be set. */
export interface PubSubMessageDefinition<
  PayloadSchema extends ZodType = ZodType,
> extends MessageDefinition<'pubsub', PayloadSchema> {
  config: BaseMessageConfig<'pubsub', PayloadSchema, never> & { topic: string }
}

/** What `declarePointToPoint()` returns: a definition whose `queue` is known to be set. */
export interface PointToPointMessageDefinition<
  PayloadSchema extends ZodType = ZodType,
> extends MessageDefinition<'point-to-point', PayloadSchema> {
  config: BaseMessageConfig<'point-to-point', PayloadSchema, never> & { queue: string }
}

/** What `declareRequestReply()` returns: `topic` and `responseSchema` are known to be set. */
export interface RequestReplyMessageDefinition<
  PayloadSchema extends ZodType = ZodType,
  ResponseSchema extends ZodType = ZodType,
> extends MessageDefinition<'request-reply', PayloadSchema, ResponseSchema> {
  config: BaseMessageConfig<'request-reply', PayloadSchema, ResponseSchema> & {
    topic: string
    responseSchema: ResponseSchema
  }
}

export const pubsubMessageDefinitionSchema = z.object({
  config: pubsubMessageConfigSchema,
})

export const pointToPointMessageDefinitionSchema = z.object({
  config: pointToPointMessageConfigSchema,
})

export const requestReplyMessageDefinitionSchema = z.object({
  config: requestReplyMessageConfigSchema,
})
