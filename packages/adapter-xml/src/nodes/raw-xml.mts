export const RawXmlSymbol = Symbol.for('xml.raw')

/** Represents raw XML content - inserted without any escaping or wrapping */
export interface RawXmlNode {
  type: typeof RawXmlSymbol
  content: string
}

/**
 * DangerouslyInsertRawXml - inserts raw XML/HTML without any escaping or wrapping
 *
 * WARNING: This bypasses all XML escaping. Only use with trusted content!
 * Use cases:
 * - Pre-rendered XML fragments
 * - HTML content in RSS/Atom feeds (in description/content:encoded)
 * - Including XML from external sources that's already valid
 */
export function DangerouslyInsertRawXml({ children }: { children: string }): RawXmlNode {
  return {
    type: RawXmlSymbol,
    content: String(children),
  }
}
