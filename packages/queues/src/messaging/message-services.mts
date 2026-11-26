import { inject, InjectionToken, registerInjectable } from '@navios/di'
import { z } from 'zod/v4'

import type { ZodType } from 'zod/v4'

import { QueueClientToken } from '../client/queue-client-token.mjs'

import type { QueueClient } from '../client/queue-client.mjs'

import {
  pointToPointMessageDefinitionSchema,
  pubsubMessageDefinitionSchema,
  requestReplyMessageDefinitionSchema,
} from './message-config.mjs'

import type { MessageDefinition } from './message-config.mjs'

/**
 * What `QueuePublisher`, `QueueSender` and `QueueRequester` share: the queue
 * client of `name` and the config of the declaration, both validated by the
 * argument schema of their token. Not exported from the package.
 */
export abstract class MessageService<Config extends { payloadSchema: ZodType }> {
  protected readonly client: QueueClient
  protected readonly config: Config

  constructor({ messageDef, name }: { messageDef: { config: Config }; name: string }) {
    this.client = inject(QueueClientToken, { name })
    this.config = messageDef.config
  }

  /** Validates `payload` with the payload schema of the declaration. */
  protected parsePayload(payload: unknown): unknown {
    return this.config.payloadSchema.parse(payload)
  }
}

export const queuePublisherOptionsSchema = z.object({
  messageDef: pubsubMessageDefinitionSchema,
  name: z.string().default('default'),
})

export const QueuePublisherToken = InjectionToken.create<
  QueuePublisher<any>,
  typeof queuePublisherOptionsSchema
>('QueuePublisher', queuePublisherOptionsSchema)

/**
 * Publishes a pub/sub declaration to its topic.
 *
 * @example
 * ```ts
 * const welcome = messageBuilder().declarePubSub({
 *   topic: 'user.welcome',
 *   payloadSchema: z.object({ name: z.string() }),
 * })
 *
 * @Injectable()
 * class UserService {
 *   private readonly welcome = inject(QueuePublisherToken, { messageDef: welcome })
 *
 *   async greet(user: User) {
 *     await this.welcome.publish({ name: user.name })
 *   }
 * }
 * ```
 */
export class QueuePublisher<
  MessageDef extends MessageDefinition<'pubsub', any>,
> extends MessageService<z.output<typeof pubsubMessageDefinitionSchema>['config']> {
  /** Validates `payload` with the payload schema and publishes it to the topic. */
  async publish(payload: z.input<MessageDef['config']['payloadSchema']>): Promise<void> {
    await this.client.publish(this.config.topic, this.parsePayload(payload))
  }
}

registerInjectable(QueuePublisher, { token: QueuePublisherToken })

export const queueSenderOptionsSchema = z.object({
  messageDef: pointToPointMessageDefinitionSchema,
  name: z.string().default('default'),
})

export const QueueSenderToken = InjectionToken.create<
  QueueSender<any>,
  typeof queueSenderOptionsSchema
>('QueueSender', queueSenderOptionsSchema)

/**
 * Sends a point-to-point declaration to its queue.
 *
 * @example
 * ```ts
 * const processOrder = messageBuilder().declarePointToPoint({
 *   queue: 'orders.process',
 *   payloadSchema: z.object({ orderId: z.string() }),
 * })
 *
 * @Injectable()
 * class OrderService {
 *   private readonly processOrder = inject(QueueSenderToken, { messageDef: processOrder })
 *
 *   async process(orderId: string) {
 *     await this.processOrder.send({ orderId })
 *   }
 * }
 * ```
 */
export class QueueSender<
  MessageDef extends MessageDefinition<'point-to-point', any>,
> extends MessageService<z.output<typeof pointToPointMessageDefinitionSchema>['config']> {
  /** Validates `payload` with the payload schema and sends it to the queue. */
  async send(payload: z.input<MessageDef['config']['payloadSchema']>): Promise<void> {
    await this.client.send(this.config.queue, this.parsePayload(payload))
  }
}

registerInjectable(QueueSender, { token: QueueSenderToken })

export const queueRequesterOptionsSchema = z.object({
  messageDef: requestReplyMessageDefinitionSchema,
  name: z.string().default('default'),
})

export const QueueRequesterToken = InjectionToken.create<
  QueueRequester<any>,
  typeof queueRequesterOptionsSchema
>('QueueRequester', queueRequesterOptionsSchema)

/**
 * Sends a request/reply declaration and resolves to its reply.
 *
 * @example
 * ```ts
 * const getUser = messageBuilder().declareRequestReply({
 *   topic: 'user.get',
 *   payloadSchema: z.object({ userId: z.string() }),
 *   responseSchema: z.object({ id: z.string(), name: z.string() }),
 * })
 *
 * @Injectable()
 * class UserService {
 *   private readonly getUser = inject(QueueRequesterToken, { messageDef: getUser })
 *
 *   async fetch(userId: string) {
 *     return this.getUser.request({ userId })
 *   }
 * }
 * ```
 */
export class QueueRequester<
  MessageDef extends MessageDefinition<'request-reply', any, any>,
> extends MessageService<z.output<typeof requestReplyMessageDefinitionSchema>['config']> {
  /**
   * Validates `payload` with the payload schema, sends the request and
   * resolves to the reply parsed with the response schema.
   */
  async request(
    payload: z.input<MessageDef['config']['payloadSchema']>,
  ): Promise<z.output<MessageDef['config']['responseSchema']>> {
    const response = await this.client.request(this.config.topic, this.parsePayload(payload))
    return this.config.responseSchema.parse(response) as z.output<
      MessageDef['config']['responseSchema']
    >
  }
}

registerInjectable(QueueRequester, { token: QueueRequesterToken })
