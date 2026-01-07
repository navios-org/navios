import type { z } from 'zod/v4'

import { assertType, describe, expectTypeOf, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type {
  EventHandler,
  EventUnsubscribe,
} from '../eventsource-handlers.mjs'
import type { EventSourceBuilderInstance } from '../eventsource-builder-instance.mjs'
import type {
  DeclareEventSourceOptions,
  InferEventSourceConnectParams,
  EventSourceHandler,
  EventSourceHandle,
} from '../../eventsource/types.mjs'

// Declare a mock eventsource builder instance at module level
declare const sse: EventSourceBuilderInstance
declare const esHandle: EventSourceHandle

// Test schemas
const messagePayloadSchema = zod.object({
  text: zod.string(),
  from: zod.string(),
  timestamp: zod.number(),
})

const typingPayloadSchema = zod.object({
  userId: zod.string(),
  isTyping: zod.boolean(),
})

type MessagePayload = z.output<typeof messagePayloadSchema>
type _TypingPayload = z.output<typeof typingPayloadSchema>

describe('EventSourceBuilderInstance', () => {
  describe('defineEvent() method', () => {
    test('event handler returns unsubscribe function', () => {
      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messagePayloadSchema,
      })

      // Should take a handler and return EventUnsubscribe
      assertType<(handler: (payload: MessagePayload) => void) => EventUnsubscribe>(
        onMessage,
      )
    })

    test('event handler config has eventName as literal', () => {
      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messagePayloadSchema,
      })

      expectTypeOf(onMessage.config.eventName).toEqualTypeOf<'message'>()
    })

    test('event handler without payloadSchema receives unknown', () => {
      const onAny = sse.defineEvent({
        eventName: 'any.event',
      })

      assertType<(handler: (payload: unknown) => void) => EventUnsubscribe>(onAny)
    })

    test('EventUnsubscribe type is a void-returning function', () => {
      expectTypeOf<EventUnsubscribe>().toEqualTypeOf<() => void>()
    })
  })
})

describe('Type inference utilities', () => {
  describe('InferEventPayload', () => {
    test('infers payload type from payloadSchema via defineEvent', () => {
      const onMessage = sse.defineEvent({
        eventName: 'test',
        payloadSchema: messagePayloadSchema,
      })

      onMessage((payload) => {
        assertType<MessagePayload>(payload)
      })
    })

    test('returns unknown without payloadSchema', () => {
      const onAny = sse.defineEvent({
        eventName: 'test',
      })

      onAny((payload) => {
        assertType<unknown>(payload)
      })
    })
  })
})

describe('EventHandler types', () => {
  describe('EventHandler', () => {
    test('EventHandler is callable returning EventUnsubscribe', () => {
      const onMessage = sse.defineEvent({
        eventName: 'test',
        payloadSchema: messagePayloadSchema,
      })

      // Verify handler takes a callback and returns EventUnsubscribe
      assertType<(handler: (payload: MessagePayload) => void) => EventUnsubscribe>(
        onMessage,
      )

      // Verify it's an EventHandler
      assertType<EventHandler<typeof onMessage.config>>(onMessage)
    })

    test('EventHandler has config property', () => {
      const onMessage = sse.defineEvent({
        eventName: 'test',
        payloadSchema: messagePayloadSchema,
      })

      // Config should have the eventName and payloadSchema
      expectTypeOf(onMessage.config.eventName).toEqualTypeOf<'test'>()
      expectTypeOf(onMessage.config.payloadSchema).toEqualTypeOf<
        typeof messagePayloadSchema
      >()
    })
  })
})

describe('EventSource handler types', () => {
  describe('DeclareEventSourceOptions', () => {
    test('minimal options with only url', () => {
      type Options = DeclareEventSourceOptions<'/events'>

      const options: Options = {
        url: '/events',
      }
      assertType<Options>(options)
    })

    test('options with querySchema', () => {
      const querySchema = zod.object({ token: zod.string() })

      type Options = DeclareEventSourceOptions<'/events', typeof querySchema>

      const options: Options = {
        url: '/events',
        querySchema,
      }
      assertType<Options>(options)
    })

    test('options with urlParamsSchema', () => {
      const urlParamsSchema = zod.object({ roomId: zod.string().uuid() })

      type Options = DeclareEventSourceOptions<
        '/events/$roomId',
        undefined,
        typeof urlParamsSchema
      >

      const options: Options = {
        url: '/events/$roomId',
        urlParamsSchema,
      }
      assertType<Options>(options)
    })

    test('options with withCredentials', () => {
      type Options = DeclareEventSourceOptions<'/events'>

      const options: Options = {
        url: '/events',
        withCredentials: true,
      }
      assertType<Options>(options)
    })
  })

  describe('InferEventSourceConnectParams', () => {
    test('URL without params requires empty args', () => {
      const options = {
        url: '/events',
      } as const

      type Options = typeof options
      type Params = InferEventSourceConnectParams<Options>

      // Should be empty-ish object (no urlParams or params required)
      const params: Params = {}
      assertType<Params>(params)
    })

    test('URL with params requires urlParams', () => {
      const options = {
        url: '/events/$roomId',
      } as const

      type Options = typeof options
      type Params = InferEventSourceConnectParams<Options>

      assertType<Params>({
        urlParams: { roomId: '123' },
      })
    })

    test('URL with multiple params', () => {
      const options = {
        url: '/users/$userId/rooms/$roomId',
      } as const

      type Options = typeof options
      type Params = InferEventSourceConnectParams<Options>

      assertType<Params>({
        urlParams: { userId: '1', roomId: '2' },
      })
    })

    test('with querySchema requires params', () => {
      const querySchema = zod.object({ token: zod.string() })

      const options = {
        url: '/events',
        querySchema,
      } as const

      type Options = typeof options
      type Params = InferEventSourceConnectParams<Options>

      assertType<Params>({
        params: { token: 'abc' },
      })
    })

    test('with urlParamsSchema and querySchema requires both', () => {
      const urlParamsSchema = zod.object({ roomId: zod.string() })
      const querySchema = zod.object({ token: zod.string() })

      const options = {
        url: '/events/$roomId',
        urlParamsSchema,
        querySchema,
      } as const

      type Options = typeof options
      type Params = InferEventSourceConnectParams<Options>

      assertType<Params>({
        urlParams: { roomId: '123' },
        params: { token: 'abc' },
      })
    })
  })

  describe('EventSourceHandler', () => {
    test('handler returns EventSourceHandle', () => {
      const options = {
        url: '/events/$roomId',
      } as const

      type Options = typeof options
      type Handler = EventSourceHandler<Options>

      assertType<
        (params: { urlParams: { roomId: string | number } }) => EventSourceHandle
      >({} as Handler)
    })

    test('handler can be called without params when none required', () => {
      const options = {
        url: '/events',
      } as const

      type Options = typeof options
      type Handler = EventSourceHandler<Options>

      // Should be callable with no arguments
      assertType<(() => EventSourceHandle) & { config: Options }>({} as Handler)
    })

    test('handler has config property', () => {
      const options = {
        url: '/events',
      } as const

      type Options = typeof options
      type Handler = EventSourceHandler<Options>
      type Config = Handler['config']

      assertType<Options>({} as Config)
    })
  })

  describe('EventSourceHandle interface', () => {
    test('has on method', () => {
      assertType<(event: string, handler: (data: unknown) => void) => void>(
        esHandle.on,
      )
    })

    test('has off method', () => {
      assertType<(event: string, handler?: (data: unknown) => void) => void>(
        esHandle.off,
      )
    })

    test('has onError method', () => {
      assertType<(handler: (error: Event) => void) => () => void>(esHandle.onError)
    })

    test('has onOpen method', () => {
      assertType<(handler: (event: Event) => void) => () => void>(esHandle.onOpen)
    })

    test('has close method', () => {
      assertType<() => void>(esHandle.close)
    })

    test('has connected property', () => {
      assertType<boolean>(esHandle.connected)
    })

    test('has state property', () => {
      assertType<'connecting' | 'open' | 'closed'>(esHandle.state)
    })

    test('has source property', () => {
      assertType<EventSource>(esHandle.source)
    })
  })
})

describe('Error cases - should fail type checking', () => {
  test('event handler callback receives correct type', () => {
    const onMessage = sse.defineEvent({
      eventName: 'message',
      payloadSchema: messagePayloadSchema,
    })

    onMessage((msg) => {
      assertType<string>(msg.text)
      assertType<string>(msg.from)
      assertType<number>(msg.timestamp)

      // @ts-expect-error - property doesn't exist
      void msg.nonExistent
    })
  })

  test('urlParams required when URL has params', () => {
    const options = {
      url: '/events/$roomId',
    } as const

    type Options = typeof options
    type Params = InferEventSourceConnectParams<Options>

    // @ts-expect-error - urlParams is required
    const _wrongParams: Params = {}
  })
})

describe('Const generic inference', () => {
  test('eventName is inferred as literal type', () => {
    const onMessage = sse.defineEvent({
      eventName: 'chat.message',
      payloadSchema: messagePayloadSchema,
    })

    // EventName should be literal 'chat.message', not string
    expectTypeOf(onMessage.config.eventName).toEqualTypeOf<'chat.message'>()
  })

  test('multiple events have different literal eventNames', () => {
    const onMessage = sse.defineEvent({
      eventName: 'chat.message',
      payloadSchema: messagePayloadSchema,
    })

    const onTyping = sse.defineEvent({
      eventName: 'user.typing',
      payloadSchema: typingPayloadSchema,
    })

    // Each should have its own literal type
    expectTypeOf(onMessage.config.eventName).toEqualTypeOf<'chat.message'>()
    expectTypeOf(onTyping.config.eventName).toEqualTypeOf<'user.typing'>()

    // They should NOT be assignable to each other
    type EventName1 = typeof onMessage.config.eventName
    type EventName2 = typeof onTyping.config.eventName

    // Verify they're different literal types
    expectTypeOf<EventName1>().not.toEqualTypeOf<EventName2>()
  })

  test('url is inferred as literal type', () => {
    const options = {
      url: '/events/$roomId',
    } as const

    type Options = typeof options
    expectTypeOf<Options['url']>().toEqualTypeOf<'/events/$roomId'>()
  })
})
