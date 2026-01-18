export interface NaviosFakeAdapter {
  fetch: typeof globalThis.fetch
  mock: (url: string, method: string, mock: (input: string, req?: RequestInit) => Response) => void
}

export function makeNaviosFakeAdapter(): NaviosFakeAdapter {
  const mocks = new Map<string, Map<string, (input: string, req?: RequestInit) => Response>>()
  // @ts-ignore TS2322
  const fetch: typeof globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlBase = typeof input === 'string' ? input : input.toString()
    const url = urlBase.split('?')[0].replace(/https?:\/\/[^/]+/, '')
    const method = init?.method ?? 'GET'
    const mock = mocks.get(url)?.get(method)
    if (mock) {
      return mock(urlBase, init)
    }
    throw new Error(`No mock for ${url} with method ${method}`)
  }

  const mock = (
    url: string,
    method: string,
    mock: (input: string, req?: RequestInit) => Response,
  ) => {
    if (!mocks.has(url)) {
      mocks.set(url, new Map())
    }
    mocks.get(url)?.set(method, mock)
  }

  return {
    fetch,
    mock,
  }
}
