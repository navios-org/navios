import { create } from '../client/create-navios.mjs'

import type { Navios } from '../client/index.mjs'
import type { NaviosConfig } from '../navios-config.mjs'

export interface Call {
  url: string
  init: RequestInit & { headers: Record<string, string>; duplex?: string }
}

/** A client over a stubbed adapter that records what would go to `fetch`. */
export function recordingClient(
  config: Omit<NaviosConfig, 'adapter'> = {},
  respond: (call: Call) => Response | Promise<Response> = () => Response.json({}),
): { navios: Navios; calls: Call[] } {
  const calls: Call[] = []
  const navios = create({
    baseURL: 'http://x.test',
    ...config,
    adapter: async (url, init) => {
      const call = { url: String(url), init: (init ?? {}) as Call['init'] }
      calls.push(call)
      return respond(call)
    },
  })
  return { navios, calls }
}
