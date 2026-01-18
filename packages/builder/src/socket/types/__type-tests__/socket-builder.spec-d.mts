import { assertType, describe, expectTypeOf, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type { z } from 'zod/v4'

import type {
  DeclareWebSocketOptions,
  InferWebSocketConnectParams,
  WebSocketHandler,
  WebSocketSocketHandle,
} from '../../websocket/types.mjs'
import type { SocketBuilderInstance } from '../socket-builder-instance.mjs'
import type { SendHandler, SubscribeHandler, Unsubscribe } from '../socket-handlers.mjs'

// Declare a mock socket builder instance at module level
declare const socket: SocketBuilderInstance
declare const wsHandle: WebSocketSocketHandle

// Test schemas
const messagePayloadSchema = zod.object({
  text: zod.string(),
  roomId: zod.string(),
})

const messageResponseSchema = zod.object({
  text: zod.string(),
  from: zod.string(),
  timestamp: zod.number(),
})

const ackSchema = zod.object({
  messageId: zod.string(),
  deliveredAt: zod.string(),
})

const roomSchema = zod.object({
  roomId: zod.string(),
  createdAt: zod.string(),
})

type MessagePayload = z.input<typeof messagePayloadSchema>
type MessageResponse = z.output<typeof messageResponseSchema>
type AckType = z.output<typeof ackSchema>
type RoomType = z.output<typeof roomSchema>

describe('SocketBuilderInstance', () => {
  describe('defineSend() method', () => {
    describe('fire-and-forget (no ackSchema)', () => {
      test('send handler returns void without ackSchema', () => {
        const sendMessage = socket.defineSend({
          topic: 'chat.message',
          payloadSchema: messagePayloadSchema,
        })

        // Return type should be void
        assertType<(payload: MessagePayload) => void>(sendMessage)
      })

      test('send handler config has topic as literal', () => {
        const sendMessage = socket.defineSend({
          topic: 'chat.message',
          payloadSchema: messagePayloadSchema,
        })

        // Has config property with literal topic type
        expectTypeOf(sendMessage.config.topic).toEqualTypeOf<'chat.message'>()
      })

      test('send handler without payloadSchema accepts unknown', () => {
        const sendPing = socket.defineSend({
          topic: 'ping',
        })

        assertType<(payload: unknown) => void>(sendPing)
      })
    })

    describe('request-response (with ackSchema)', () => {
      test('send handler returns Promise with ackSchema', () => {
        const createRoom = socket.defineSend({
          topic: 'room.create',
          payloadSchema: messagePayloadSchema,
          ackSchema: roomSchema,
        })

        // Return type should be Promise<RoomType>
        assertType<(payload: MessagePayload) => Promise<RoomType>>(createRoom)
      })

      test('send handler config includes ackSchema', () => {
        const createRoom = socket.defineSend({
          topic: 'room.create',
          payloadSchema: messagePayloadSchema,
          ackSchema: roomSchema,
        })

        // Has config property
        expectTypeOf(createRoom.config.topic).toEqualTypeOf<'room.create'>()
        expectTypeOf(createRoom.config.ackSchema).toEqualTypeOf<typeof roomSchema>()
      })

      test('send handler with ackTimeout still returns Promise', () => {
        const createRoom = socket.defineSend({
          topic: 'room.create',
          payloadSchema: messagePayloadSchema,
          ackSchema: roomSchema,
          ackTimeout: 5000,
        })

        assertType<(payload: MessagePayload) => Promise<RoomType>>(createRoom)
      })
    })
  })

  describe('defineSubscribe() method', () => {
    test('subscribe handler returns unsubscribe function', () => {
      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: messageResponseSchema,
      })

      // Should take a handler and return Unsubscribe
      assertType<(handler: (payload: MessageResponse) => void) => Unsubscribe>(onMessage)
    })

    test('subscribe handler config has topic as literal', () => {
      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: messageResponseSchema,
      })

      expectTypeOf(onMessage.config.topic).toEqualTypeOf<'chat.message'>()
    })

    test('subscribe handler without payloadSchema receives unknown', () => {
      const onAny = socket.defineSubscribe({
        topic: 'any.message',
      })

      assertType<(handler: (payload: unknown) => void) => Unsubscribe>(onAny)
    })

    test('Unsubscribe type is a void-returning function', () => {
      expectTypeOf<Unsubscribe>().toEqualTypeOf<() => void>()
    })
  })
})

describe('Type inference utilities', () => {
  describe('InferSendPayload', () => {
    test('infers payload type from payloadSchema via defineSend', () => {
      // Test via actual usage - the type inference works through defineSend
      const sendMessage = socket.defineSend({
        topic: 'test',
        payloadSchema: messagePayloadSchema,
      })

      // The handler accepts MessagePayload
      assertType<(payload: MessagePayload) => void>(sendMessage)
    })

    test('returns unknown without payloadSchema', () => {
      const sendPing = socket.defineSend({
        topic: 'test',
      })

      // Without schema, accepts unknown
      assertType<(payload: unknown) => void>(sendPing)
    })
  })

  describe('InferSendReturn', () => {
    test('returns void without ackSchema', () => {
      const send = socket.defineSend({
        topic: 'test',
        payloadSchema: messagePayloadSchema,
      })

      // Should return void without ackSchema
      const result = send({ text: 'hi', roomId: 'room' })
      assertType<void>(result)
    })

    test('returns Promise with ackSchema', () => {
      const send = socket.defineSend({
        topic: 'test',
        payloadSchema: messagePayloadSchema,
        ackSchema,
      })

      // Should return Promise<AckType> with ackSchema
      const result = send({ text: 'hi', roomId: 'room' })
      assertType<Promise<AckType>>(result)
    })
  })

  describe('InferSubscribePayload', () => {
    test('infers payload type from payloadSchema via defineSubscribe', () => {
      const onMessage = socket.defineSubscribe({
        topic: 'test',
        payloadSchema: messageResponseSchema,
      })

      // The handler callback receives MessageResponse
      onMessage((payload) => {
        assertType<MessageResponse>(payload)
      })
    })

    test('returns unknown without payloadSchema', () => {
      const onAny = socket.defineSubscribe({
        topic: 'test',
      })

      // Without schema, receives unknown
      onAny((payload) => {
        assertType<unknown>(payload)
      })
    })
  })
})

describe('Handler types', () => {
  describe('SendHandler', () => {
    test('SendHandler without ackSchema is callable returning void', () => {
      const sendMessage = socket.defineSend({
        topic: 'test',
        payloadSchema: messagePayloadSchema,
      })

      // Verify handler is callable with correct payload type
      assertType<(payload: MessagePayload) => void>(sendMessage)

      // Verify it's a SendHandler
      assertType<SendHandler<typeof sendMessage.config>>(sendMessage)
    })

    test('SendHandler with ackSchema is callable returning Promise', () => {
      const createRoom = socket.defineSend({
        topic: 'test',
        payloadSchema: messagePayloadSchema,
        ackSchema,
      })

      // Verify handler returns Promise
      assertType<(payload: MessagePayload) => Promise<AckType>>(createRoom)

      // Verify it's a SendHandler
      assertType<SendHandler<typeof createRoom.config>>(createRoom)
    })

    test('SendHandler has config property', () => {
      const sendMessage = socket.defineSend({
        topic: 'test',
        payloadSchema: messagePayloadSchema,
      })

      // Config should have the topic and payloadSchema
      expectTypeOf(sendMessage.config.topic).toEqualTypeOf<'test'>()
      expectTypeOf(sendMessage.config.payloadSchema).toEqualTypeOf<typeof messagePayloadSchema>()
    })
  })

  describe('SubscribeHandler', () => {
    test('SubscribeHandler is callable returning Unsubscribe', () => {
      const onMessage = socket.defineSubscribe({
        topic: 'test',
        payloadSchema: messageResponseSchema,
      })

      // Verify handler takes a callback and returns Unsubscribe
      assertType<(handler: (payload: MessageResponse) => void) => Unsubscribe>(onMessage)

      // Verify it's a SubscribeHandler
      assertType<SubscribeHandler<typeof onMessage.config>>(onMessage)
    })

    test('SubscribeHandler has config property', () => {
      const onMessage = socket.defineSubscribe({
        topic: 'test',
        payloadSchema: messageResponseSchema,
      })

      // Config should have the topic and payloadSchema
      expectTypeOf(onMessage.config.topic).toEqualTypeOf<'test'>()
      expectTypeOf(onMessage.config.payloadSchema).toEqualTypeOf<typeof messageResponseSchema>()
    })
  })
})

describe('WebSocket handler types', () => {
  describe('DeclareWebSocketOptions', () => {
    test('minimal options with only url', () => {
      type Options = DeclareWebSocketOptions<'wss://example.com/ws'>

      const options: Options = {
        url: 'wss://example.com/ws',
      }
      assertType<Options>(options)
    })

    test('options with querySchema', () => {
      const querySchema = zod.object({ token: zod.string() })

      type Options = DeclareWebSocketOptions<'wss://example.com/ws', typeof querySchema>

      const options: Options = {
        url: 'wss://example.com/ws',
        querySchema,
      }
      assertType<Options>(options)
    })

    test('options with urlParamsSchema', () => {
      const urlParamsSchema = zod.object({ roomId: zod.string().uuid() })

      type Options = DeclareWebSocketOptions<
        'wss://example.com/ws/$roomId',
        undefined,
        typeof urlParamsSchema
      >

      const options: Options = {
        url: 'wss://example.com/ws/$roomId',
        urlParamsSchema,
      }
      assertType<Options>(options)
    })

    test('options with protocols', () => {
      type Options = DeclareWebSocketOptions<'wss://example.com/ws'>

      const options: Options = {
        url: 'wss://example.com/ws',
        protocols: ['v1.chat', 'v2.chat'],
      }
      assertType<Options>(options)
    })
  })

  describe('InferWebSocketConnectParams', () => {
    test('URL without params requires empty object', () => {
      // Use a const object to get proper type inference
      const options = {
        url: 'wss://example.com/ws',
      } as const

      type Options = typeof options
      type Params = InferWebSocketConnectParams<Options>

      // Should be empty-ish object (no urlParams or params required)
      const params: Params = {}
      assertType<Params>(params)
    })

    test('URL with params requires urlParams', () => {
      // Use a const object to get proper type inference
      const options = {
        url: 'wss://example.com/ws/$roomId',
      } as const

      type Options = typeof options
      type Params = InferWebSocketConnectParams<Options>

      assertType<Params>({
        urlParams: { roomId: '123' },
      })
    })

    test('URL with multiple params', () => {
      // Use a const object to get proper type inference
      const options = {
        url: 'wss://example.com/ws/$userId/rooms/$roomId',
      } as const

      type Options = typeof options
      type Params = InferWebSocketConnectParams<Options>

      assertType<Params>({
        urlParams: { userId: '1', roomId: '2' },
      })
    })

    test('with querySchema requires params', () => {
      const querySchema = zod.object({ token: zod.string() })

      // Define options as a const object to let TypeScript infer correctly
      const options = {
        url: 'wss://example.com/ws',
        querySchema,
      } as const

      type Options = typeof options
      type Params = InferWebSocketConnectParams<Options>

      assertType<Params>({
        params: { token: 'abc' },
      })
    })

    test('with urlParamsSchema and querySchema requires both', () => {
      const urlParamsSchema = zod.object({ roomId: zod.string() })
      const querySchema = zod.object({ token: zod.string() })

      // Define options as a const object to let TypeScript infer correctly
      const options = {
        url: 'wss://example.com/ws/$roomId',
        urlParamsSchema,
        querySchema,
      } as const

      type Options = typeof options
      type Params = InferWebSocketConnectParams<Options>

      assertType<Params>({
        urlParams: { roomId: '123' },
        params: { token: 'abc' },
      })
    })
  })

  describe('WebSocketHandler', () => {
    test('handler returns WebSocketSocketHandle', () => {
      // Use a const object to get proper type inference
      const options = {
        url: 'wss://example.com/ws/$roomId',
      } as const

      type Options = typeof options
      type Handler = WebSocketHandler<Options>

      assertType<(params: { urlParams: { roomId: string | number } }) => WebSocketSocketHandle>(
        {} as Handler,
      )
    })

    test('handler has config property', () => {
      // Use a const object to get proper type inference
      const options = {
        url: 'wss://example.com/ws',
      } as const

      type Options = typeof options
      type Handler = WebSocketHandler<Options>
      type Config = Handler['config']

      assertType<Options>({} as Config)
    })
  })

  describe('WebSocketSocketHandle interface', () => {
    test('has emit method', () => {
      assertType<(event: string, ...args: unknown[]) => void>(wsHandle.emit)
    })

    test('has on method', () => {
      assertType<(event: string, handler: (...args: unknown[]) => void) => void>(wsHandle.on)
    })

    test('has off method', () => {
      assertType<(event: string, handler?: (...args: unknown[]) => void) => void>(wsHandle.off)
    })

    test('has disconnect method', () => {
      assertType<(code?: number, reason?: string) => void>(wsHandle.disconnect)
    })

    test('has close method (alias)', () => {
      assertType<(code?: number, reason?: string) => void>(wsHandle.close)
    })

    test('has connected property', () => {
      assertType<boolean>(wsHandle.connected)
    })

    test('has state property', () => {
      assertType<'connecting' | 'open' | 'closing' | 'closed'>(wsHandle.state)
    })

    test('has socket property', () => {
      assertType<WebSocket>(wsHandle.socket)
    })
  })
})

describe('Error cases - should fail type checking', () => {
  test('send handler requires correct payload type', () => {
    const sendMessage = socket.defineSend({
      topic: 'chat.message',
      payloadSchema: messagePayloadSchema,
    })

    // @ts-expect-error - missing required properties
    sendMessage({})

    // @ts-expect-error - wrong property types
    sendMessage({ text: 123, roomId: 'room' })
  })

  test('subscribe handler callback receives correct type', () => {
    const onMessage = socket.defineSubscribe({
      topic: 'chat.message',
      payloadSchema: messageResponseSchema,
    })

    onMessage((msg) => {
      assertType<string>(msg.text)
      assertType<string>(msg.from)
      assertType<number>(msg.timestamp)

      // @ts-expect-error - property doesn't exist
      void msg.nonExistent
    })
  })

  test('send handler with ackSchema must be awaited', () => {
    const createRoom = socket.defineSend({
      topic: 'room.create',
      payloadSchema: messagePayloadSchema,
      ackSchema: roomSchema,
    })

    // This returns Promise<RoomType>, not RoomType directly
    const result = createRoom({ text: 'hi', roomId: 'room' })

    // The result is a Promise
    assertType<Promise<RoomType>>(result)

    // @ts-expect-error - cannot access properties directly on Promise
    void result.roomId
  })
})

describe('Const generic inference', () => {
  test('topic is inferred as literal type', () => {
    const sendMessage = socket.defineSend({
      topic: 'chat.message',
      payloadSchema: messagePayloadSchema,
    })

    // Topic should be literal 'chat.message', not string
    expectTypeOf(sendMessage.config.topic).toEqualTypeOf<'chat.message'>()
  })

  test('multiple sends have different literal topics', () => {
    const sendMessage = socket.defineSend({
      topic: 'chat.message',
      payloadSchema: messagePayloadSchema,
    })

    const sendNotification = socket.defineSend({
      topic: 'notification',
      payloadSchema: messagePayloadSchema,
    })

    // Each should have its own literal type
    expectTypeOf(sendMessage.config.topic).toEqualTypeOf<'chat.message'>()
    expectTypeOf(sendNotification.config.topic).toEqualTypeOf<'notification'>()

    // They should NOT be assignable to each other
    type Topic1 = typeof sendMessage.config.topic
    type Topic2 = typeof sendNotification.config.topic

    // Verify they're different literal types
    expectTypeOf<Topic1>().not.toEqualTypeOf<Topic2>()
  })

  test('subscribe topic is inferred as literal type', () => {
    const onMessage = socket.defineSubscribe({
      topic: 'chat.message',
      payloadSchema: messageResponseSchema,
    })

    expectTypeOf(onMessage.config.topic).toEqualTypeOf<'chat.message'>()
  })
})
