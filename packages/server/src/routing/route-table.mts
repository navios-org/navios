import { isUnmatchable } from './route-path.mjs'

import type { RoutePath, RouteSegment } from './route-path.mjs'

interface Entry<T> {
  method: string
  segments: readonly RouteSegment[]
  value: T
}

/** The routes of one length, by what they begin with. */
interface Group<T> {
  /** Those that begin with fixed text, by that text. */
  fixed: Map<string, Entry<T>[]>
  /** Those that begin with a url param. */
  open: Entry<T>[]
}

export interface RouteMatch<T> {
  readonly value: T
  readonly urlParams: Record<string, string>
}

/**
 * Finds routes by method and path, with the rules of the routers of the
 * Fastify and Bun adapters: the whole path has to match, fixed text wins over
 * a url param at the first segment where two routes differ, and the order of
 * registration does not matter. For adapters that have no router of their
 * own, and for `inject()`.
 */
export class RouteTable<T> {
  private readonly bySize = new Map<number, Group<T>>()

  /**
   * @param decode Decodes one segment. The default throws a `URIError` for
   *   percent-encoding that is not valid.
   */
  constructor(private readonly decode: (segment: string) => string = decodeURIComponent) {}

  add(method: string, { segments }: RoutePath, value: T): void {
    const entry = { method, segments, value }
    let group = this.bySize.get(segments.length)
    if (group === undefined) {
      group = { fixed: new Map(), open: [] }
      this.bySize.set(segments.length, group)
    }
    const [first] = segments
    if ('param' in first) {
      group.open.push(entry)
      return
    }
    const entries = group.fixed.get(first.literal)
    if (entries === undefined) {
      group.fixed.set(first.literal, [entry])
    } else {
      entries.push(entry)
    }
  }

  /** The route for a request. `HEAD` is served by the `GET` route when it has none of its own. */
  match(method: string, path: string): RouteMatch<T> | undefined {
    const { texts, entries } = this.matching(path)
    return (
      closest(entries, method, texts) ??
      (method === 'HEAD' ? closest(entries, 'GET', texts) : undefined)
    )
  }

  /** The methods that a path is served for. Empty when no route has the path. */
  methods(path: string): string[] {
    const { entries } = this.matching(path)
    if (entries.length === 0) {
      return []
    }
    const methods = new Set(entries.map((entry) => entry.method))
    if (methods.has('GET')) {
      methods.add('HEAD')
    }
    return [...methods].sort()
  }

  private matching(path: string): { texts: string[]; entries: Entry<T>[] } {
    if (!path.startsWith('/')) {
      return { texts: [], entries: [] }
    }
    const raw = path.slice(1).split('/')
    const group = this.bySize.get(raw.length)
    if (group === undefined) {
      return { texts: raw, entries: [] }
    }
    const texts = path.includes('%') ? raw.map(this.decode) : raw
    const entries: Entry<T>[] = []
    for (const candidates of [group.fixed.get(texts[0]), group.open]) {
      for (const entry of candidates ?? []) {
        if (matches(entry, texts)) {
          entries.push(entry)
        }
      }
    }
    return { texts, entries }
  }
}

function matches({ segments }: Entry<unknown>, texts: readonly string[]): boolean {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if ('param' in segment ? isUnmatchable(texts[i]) : segment.literal !== texts[i]) {
      return false
    }
  }
  return true
}

function closest<T>(
  entries: Entry<T>[],
  method: string,
  texts: string[],
): RouteMatch<T> | undefined {
  let found: Entry<T> | undefined
  for (const entry of entries) {
    if (entry.method === method && (found === undefined || isCloser(entry, found))) {
      found = entry
    }
  }
  if (found === undefined) {
    return undefined
  }
  const urlParams: Record<string, string> = {}
  found.segments.forEach((segment, index) => {
    if ('param' in segment) {
      urlParams[segment.param] = texts[index]
    }
  })
  return { value: found.value, urlParams }
}

function isCloser(entry: Entry<unknown>, other: Entry<unknown>): boolean {
  const index = entry.segments.findIndex(
    (segment, at) => 'param' in segment !== 'param' in other.segments[at],
  )
  return index >= 0 && 'literal' in entry.segments[index]
}
