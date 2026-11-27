import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { createEventSourceHandler, declareEventSource } from '../declare-eventsource.mjs'
import { eventSourceBuilder } from '../eventsource-builder.mjs'

import type { EventSourceClient } from '../eventsource-client.mjs'

/** An `EventSource` on which a server event and a connection event of one name both fire. */
class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = []
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(
    readonly url: string,
    readonly init?: { withCredentials?: boolean },
  ) {
    super()
    FakeEventSource.instances.push(this)
  }

  close() {
    this.readyState = 2
  }

  fire(event: Event) {
    if (event.type === 'open') this.onopen?.(event)
    if (event.type === 'error') this.onerror?.(event)
    if (event.type === 'message') this.onmessage?.(event as MessageEvent)
    this.dispatchEvent(event)
  }

  serverEvent(type: string, data: string) {
    this.fire(new MessageEvent(type, { data }))
  }
}

function connect() {
  const handle = createEventSourceHandler({ EventSource: FakeEventSource })({ url: '/feed' })()
  return { handle, source: FakeEventSource.instances.at(-1)! }
}

function memoryClient() {
  const listeners = new Map<string, Set<(data: unknown) => void>>()
  const client = {
    on: (event: string, handler: (data: unknown) => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(handler))
    },
    off: (event: string, handler?: (data: unknown) => void) => {
      if (handler) listeners.get(event)?.delete(handler)
    },
    close: vi.fn(),
    connected: true,
    deliver: (event: string, data: unknown) =>
      [...(listeners.get(event) ?? [])].forEach((handler) => handler(data)),
  }
  return client satisfies EventSourceClient
}

describe('payloads', () => {
  function subscribe(payloadSchema: z.ZodType) {
    const { handle, source } = connect()
    const onError = vi.fn()
    const listener = vi.fn()
    const sse = eventSourceBuilder({ onError })
    sse.provideClient(handle)
    sse.defineEvent({ eventName: 'text', payloadSchema })(listener)
    return { source, listener, onError }
  }

  it.each(['{"a":1}', '[1]', '"quoted"'])(
    'should not deliver the JSON %s as text when its value is refused',
    (text) => {
      const { source, listener, onError } = subscribe(
        z.union([z.object({ a: z.string() }), z.string().startsWith(text[0]!)]),
      )

      source.serverEvent('text', text)

      expect(listener).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toMatchObject({
        kind: 'validation',
        rawData: JSON.parse(text),
      })
    },
  )

  it.each(['42', 'true', 'null', 'plain words'])(
    'should accept the text %s of a server that does not encode strings',
    (text) => {
      const { source, listener, onError } = subscribe(z.string())

      source.serverEvent('text', text)

      expect(listener).toHaveBeenCalledWith(text)
      expect(onError).not.toHaveBeenCalled()
    },
  )

  it.each(['42', 'true', '{"a":1}', 'plain words'])(
    'should decode the text %s of a server that encodes strings',
    (text) => {
      const { source, listener } = subscribe(z.string())

      source.serverEvent('text', JSON.stringify(text))

      expect(listener).toHaveBeenCalledWith(text)
    },
  )

  it('should prefer the decoded payload when the schema accepts both', () => {
    const { source, listener } = subscribe(z.union([z.number(), z.string()]))

    source.serverEvent('text', '42')

    expect(listener).toHaveBeenCalledWith(42)
  })

  it('should report the problem of the decoded payload when neither is accepted', () => {
    const { source, listener, onError } = subscribe(z.object({ a: z.string() }))

    source.serverEvent('text', '{"a":1}')

    expect(listener).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toMatchObject({
      kind: 'validation',
      issues: [{ path: ['a'] }],
      rawData: { a: 1 },
    })
  })

  it('should do the same for an asynchronous schema', async () => {
    const { source, listener, onError } = subscribe(z.string().refine(async (s) => s !== '43'))

    source.serverEvent('text', '42')
    source.serverEvent('text', '43')
    await new Promise((resolve) => setTimeout(resolve))

    expect(listener.mock.calls).toEqual([['42']])
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe('server events named like connection events', () => {
  it('should not be taken for the connection', () => {
    const { handle, source } = connect()
    const onError = vi.fn()
    const onOpen = vi.fn()
    handle.onError(onError)
    handle.onOpen(onOpen)
    const sse = eventSourceBuilder()
    sse.provideClient(handle)
    const code = vi.fn()
    const room = vi.fn()
    sse.defineEvent({ eventName: 'error', payloadSchema: z.object({ code: z.string() }) })(code)
    sse.defineEvent({ eventName: 'open', payloadSchema: z.object({ room: z.string() }) })(room)

    source.serverEvent('error', '{"code":"E1"}')
    source.serverEvent('open', '{"room":"r"}')

    expect(code).toHaveBeenCalledWith({ code: 'E1' })
    expect(room).toHaveBeenCalledWith({ room: 'r' })
    expect(onError).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('should not be triggered by the connection', () => {
    const { handle, source } = connect()
    const onError = vi.fn()
    const onOpen = vi.fn()
    const listener = vi.fn()
    handle.onError(onError)
    handle.onOpen(onOpen)
    handle.on('error', listener)
    handle.on('open', listener)

    source.readyState = 1
    source.fire(new Event('open'))
    expect(handle.state).toBe('open')
    source.readyState = 2
    source.fire(new Event('error'))
    expect(handle.state).toBe('closed')

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('listeners that change while an event is delivered', () => {
  it('should let an event handler subscribe itself again', () => {
    const client = memoryClient()
    const sse = eventSourceBuilder()
    sse.provideClient(client)
    const onEvent = sse.defineEvent({ eventName: 'x' })
    let calls = 0
    const again = () => {
      if (++calls > 10) throw new Error('runaway')
      stop()
      stop = onEvent(again)
    }
    let stop = onEvent(again)
    const removed = vi.fn()
    onEvent(() => stopRemoved())
    const stopRemoved = onEvent(removed)

    client.deliver('x', 1)

    expect(calls).toBe(1)
    expect(removed).not.toHaveBeenCalled()
  })

  it.each(['x', 'message'])(
    'should let a listener of a handle register itself again: %s',
    (name) => {
      const { handle, source } = connect()
      let calls = 0
      const again = () => {
        if (++calls > 10) throw new Error('runaway')
        handle.off(name, again)
        handle.on(name, again)
      }
      handle.on(name, again)

      source.serverEvent(name, '1')

      expect(calls).toBe(1)
    },
  )

  it('should stop delivering when a listener closes the handle', () => {
    const { handle, source } = connect()
    const second = vi.fn()
    handle.on('x', () => handle.close())
    handle.on('x', second)

    source.serverEvent('x', '1')

    expect(second).not.toHaveBeenCalled()
  })

  it('should let an open or error listener register itself again', () => {
    const { handle, source } = connect()
    let calls = 0
    for (const register of [handle.onOpen, handle.onError]) {
      const again = () => {
        if (++calls > 10) throw new Error('runaway')
        stop()
        stop = register(again)
      }
      let stop = register(again)
    }

    source.fire(new Event('open'))
    source.fire(new Event('error'))

    expect(calls).toBe(2)
  })
})

describe('provideClient', () => {
  it('should ignore the client it already has', () => {
    const client = memoryClient()
    const sse = eventSourceBuilder()
    sse.provideClient(client)

    sse.provideClient(client, { closePrevious: true })

    expect(client.close).not.toHaveBeenCalled()
  })

  it('should close the previous client only when asked to', () => {
    const [first, second, third] = [memoryClient(), memoryClient(), memoryClient()]
    const sse = eventSourceBuilder()
    sse.provideClient(first)
    sse.provideClient(second)
    expect(first.close).not.toHaveBeenCalled()

    sse.provideClient(third, { closePrevious: true })
    expect(second.close).toHaveBeenCalledTimes(1)
  })
})

describe('connecting', () => {
  it.each([
    ['an optional schema', z.object({ room: z.string() }).optional(), '/feed'],
    ['a default', z.object({ room: z.string() }).default({ room: 'lobby' }), '/feed?room=lobby'],
  ])('should accept an omitted query: %s', (_name, querySchema, url) => {
    const declare = createEventSourceHandler({ EventSource: FakeEventSource })

    expect(declare({ url: '/feed', querySchema })().url).toBe(url)
  })

  it('should validate an omitted query', () => {
    const declare = createEventSourceHandler({ EventSource: FakeEventSource })
    const withDefault = declare({
      url: '/feed',
      querySchema: z.object({ room: z.string().default('lobby') }),
    })
    const required = declare({ url: '/feed', querySchema: z.object({ room: z.string() }) })

    expect(withDefault().url).toBe('/feed?room=lobby')
    expect(() => (required as unknown as () => void)()).toThrow(
      expect.objectContaining({ name: 'ConnectionError', kind: 'request-validation' }),
    )
  })

  it('should use the given constructor where there is no global one', () => {
    vi.stubGlobal('EventSource', undefined)
    vi.stubGlobal('Event', undefined)
    try {
      const handle = createEventSourceHandler({ EventSource: FakeEventSource })({
        url: '/feed',
        withCredentials: true,
      })()
      const source = FakeEventSource.instances.at(-1)!
      expect(source.init).toEqual({ withCredentials: true })
      expect(handle.state).toBe('connecting')
      source.readyState = 1
      expect(handle.connected).toBe(true)

      const onOpen = vi.fn()
      handle.onOpen(onOpen)
      expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ type: 'open' }))

      expect(() => declareEventSource({ url: '/feed' })()).toThrow(/createEventSourceHandler/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
