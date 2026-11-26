/**
 * Writes a value as the text of a query parameter or a multipart field.
 *
 * - `null` becomes an empty string
 * - a `Date`, and anything else with `toISOString`, an ISO string
 * - an object with `toJSON` what it returns, as JSON unless that is a string
 * - another object JSON
 * - anything else `String(value)`
 */
export function toQueryText(value: unknown): string {
  if (value === null) {
    return ''
  }
  if (typeof value !== 'object') {
    return String(value)
  }
  if ('toISOString' in value && typeof value.toISOString === 'function') {
    return value.toISOString()
  }
  if ('toJSON' in value && typeof value.toJSON === 'function') {
    const json = value.toJSON()
    return typeof json === 'string' ? json : JSON.stringify(json)
  }
  return JSON.stringify(value)
}
