const PARAM = /\$([A-Za-z_][A-Za-z0-9_]*)/g

/** Converts a builder path (`/users/$id`) to an OpenAPI path (`/users/{id}`). */
export function toOpenApiPath(path: string): string {
  return path.replace(PARAM, '{$1}') || '/'
}
