/** `application/json` and the types built on it, such as `application/problem+json`. */
const JSON_CONTENT_TYPE = /^\s*application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i

export function isJsonContentType(value: string | null | undefined): boolean {
  return JSON_CONTENT_TYPE.test(value ?? '')
}
