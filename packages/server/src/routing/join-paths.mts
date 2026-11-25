export function joinPaths(...parts: string[]): string {
  let result = ''
  for (const part of parts) {
    if (!part) {
      continue
    }
    const trimmed = part.replace(/^\/+|\/+$/g, '')
    if (trimmed) {
      result += `/${trimmed}`
    }
  }
  return result
}
