/**
 * The cookies of a `Cookie` header, by name. The first of two with one name
 * wins, a quoted value loses its quotes, and one that is not valid
 * percent-encoding stays as it was sent.
 * @internal
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  // Without a prototype: cookie names come from the client, and `toString`
  // or `constructor` must be neither found when not sent nor lost when sent.
  const jar: Record<string, string> = Object.create(null)
  if (!header) {
    return jar
  }
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) {
      continue
    }
    const name = part.slice(0, index).trim()
    if (name === '' || name in jar) {
      continue
    }
    let value = part.slice(index + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    try {
      jar[name] = decodeURIComponent(value)
    } catch {
      jar[name] = value
    }
  }
  return jar
}
