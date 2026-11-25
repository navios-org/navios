const PARAM = /\$([A-Za-z_][A-Za-z0-9_]*)/g

/** Converts a builder path (`/users/$id`) to an OpenAPI path (`/users/{id}`). */
export function toOpenApiPath(path: string): string {
  return path.replace(PARAM, '{$1}') || '/'
}

/** The names of the `$param` segments of a builder path, in order. */
export function extractUrlParamNames(path: string): string[] {
  return Array.from(path.matchAll(PARAM), (match) => match[1])
}
