import { z } from 'zod/v4'

/**
 * TLS/SSL configuration for secure connections
 */
export const tlsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  rejectUnauthorized: z.boolean().default(true),
  ca: z.string().optional(),
  cert: z.string().optional(),
  key: z.string().optional(),
  passphrase: z.string().optional(),
})

export type TlsConfig = z.infer<typeof tlsConfigSchema>

/**
 * Retry configuration for message processing
 */
export const retryConfigSchema = z.object({
  maxRetries: z.number().int().min(0).default(3),
  initialDelayMs: z.number().int().min(0).default(1000),
  maxDelayMs: z.number().int().min(0).default(30000),
  backoffMultiplier: z.number().min(1).default(2),
})

export type RetryConfig = z.infer<typeof retryConfigSchema>

/**
 * Dead letter queue configuration
 */
export const deadLetterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  queue: z.string().optional(),
  exchange: z.string().optional(),
  maxReceiveCount: z.number().int().min(1).default(3),
})

export type DeadLetterConfig = z.infer<typeof deadLetterConfigSchema>
