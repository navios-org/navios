import { z, ZodType } from 'zod/v4'

export type MessagePattern = 'pubsub' | 'point-to-point' | 'request-reply'

/**
 * Base message configuration similar to BaseEndpointConfig but for messages.
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

export const pubsubMessageConfigSchema = z.object({
  pattern: z.literal('pubsub'),
  topic: z.string(),
  payloadSchema: z.custom<ZodType>().refine((schema) => schema instanceof ZodType, {
    message: 'Payload schema must be a Zod type',
  }),
})

export const pointToPointMessageConfigSchema = z.object({
  pattern: z.literal('point-to-point'),
  queue: z.string(),
  payloadSchema: z.custom<ZodType>().refine((schema) => schema instanceof ZodType, {
    message: 'Payload schema must be a Zod type',
  }),
})

export const requestReplyMessageConfigSchema = z.object({
  pattern: z.literal('request-reply'),
  topic: z.string(),
  payloadSchema: z.custom<ZodType>().refine((schema) => schema instanceof ZodType, {
    message: 'Payload schema must be a Zod type',
  }),
  responseSchema: z.custom<ZodType>().refine((schema) => schema instanceof ZodType, {
    message: 'Response schema must be a Zod type',
  }),
})

export const abstractMessageConfigSchema = z.discriminatedUnion('pattern', [
  pubsubMessageConfigSchema,
  pointToPointMessageConfigSchema,
  requestReplyMessageConfigSchema,
])

export type AbstractMessageConfig = z.infer<typeof abstractMessageConfigSchema>

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

export const pubsubMessageDefinitionSchema = z.object({
  config: pubsubMessageConfigSchema,
})

export const pointToPointMessageDefinitionSchema = z.object({
  config: pointToPointMessageConfigSchema,
})

export const requestReplyMessageDefinitionSchema = z.object({
  config: requestReplyMessageConfigSchema,
})

export const abstractMessageDefinitionSchema = z.discriminatedUnion('pattern', [
  pubsubMessageDefinitionSchema,
  pointToPointMessageDefinitionSchema,
  requestReplyMessageDefinitionSchema,
])

export type AbstractMessageDefinition = z.infer<typeof abstractMessageDefinitionSchema>
