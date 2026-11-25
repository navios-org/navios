/** A request the fake adapter received. */
export interface NaviosFakeRequest {
  /** The full URL, with the query. */
  url: string
  /** The path alone. */
  path: string
  query: URLSearchParams
  method: string
  headers: Headers
  /** The body as it was passed to `fetch`: JSON as a string. */
  body: RequestInit['body']
}

/** Answers one mocked URL. */
export type NaviosFakeHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

export interface NaviosFakeAdapter {
  /** Pass it to `create({ adapter })`. */
  fetch: typeof globalThis.fetch
  /**
   * Answers the requests for one URL and method. A `url` with a query answers
   * only requests with exactly that query, in any order; one without a query
   * answers the rest. A `url` with an origin answers only that origin.
   * Mocking the same URL and method again replaces the handler.
   */
  mock: (url: string, method: string, handler: NaviosFakeHandler) => void
  /** Every request so far, in order, also the ones no mock answered. */
  readonly requests: readonly NaviosFakeRequest[]
  /** Forgets all mocks and all requests. */
  reset: () => void
}

const ORIGIN = /^[a-z][a-z\d+.-]*:\/\/[^/?#]+/i

/** Splits a URL, with or without an origin, so that equal queries compare equal. */
function parseUrl(url: string) {
  const origin = ORIGIN.exec(url)?.[0] ?? ''
  const [pathAndQuery = ''] = url.slice(origin.length).split('#', 1)
  const queryStart = pathAndQuery.indexOf('?')
  const path = queryStart === -1 ? pathAndQuery : pathAndQuery.slice(0, queryStart)
  const query = new URLSearchParams(queryStart === -1 ? '' : pathAndQuery.slice(queryStart))
  const sorted = new URLSearchParams(query)
  sorted.sort()
  return { origin, path: path || '/', query, search: sorted.toString() }
}

/**
 * A `fetch` that answers from mocks and records what it was asked.
 *
 * @example
 * ```ts
 * const fake = makeNaviosFakeAdapter()
 * fake.mock('/users/1', 'GET', () => Response.json({ id: '1' }))
 * const client = create({ baseURL: 'https://api.example.com', adapter: fake.fetch })
 * ```
 */
export function makeNaviosFakeAdapter(): NaviosFakeAdapter {
  const mocks = new Map<string, NaviosFakeHandler>()
  const requests: NaviosFakeRequest[] = []

  const key = (method: string, origin: string, path: string, search: string) =>
    `${method} ${origin}${path}${search ? `?${search}` : ''}`

  async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : undefined
    const url = request ? request.url : String(input)
    const method = init?.method ?? request?.method ?? 'GET'
    const { origin, path, query, search } = parseUrl(url)
    requests.push({
      url,
      path,
      query,
      method,
      headers: new Headers(init?.headers ?? request?.headers),
      body: init?.body ?? request?.body,
    })

    const handler =
      mocks.get(key(method, origin, path, search)) ??
      mocks.get(key(method, '', path, search)) ??
      mocks.get(key(method, origin, path, '')) ??
      mocks.get(key(method, '', path, ''))
    if (!handler) {
      throw new Error(`No mock for ${key(method, '', path, search)}`)
    }
    return handler(url, init)
  }

  return {
    fetch: fetch as typeof globalThis.fetch,
    mock(url, method, handler) {
      const { origin, path, search } = parseUrl(url)
      mocks.set(key(method, origin, path, search), handler)
    },
    requests,
    reset() {
      mocks.clear()
      requests.length = 0
    },
  }
}
