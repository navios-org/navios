import { CDataSymbol, RawXmlSymbol } from '../types/xml-node.mjs'

import type { CDataNode, RawXmlNode } from '../types/xml-node.mjs'

/**
 * CDATA component - wraps content in <![CDATA[...]]>
 * Use for text content that may contain characters like < > &
 * that would otherwise need escaping.
 *
 * Note: If content contains "]]>", it will be split into multiple CDATA sections.
 */
export function CData({ children }: { children: string }): CDataNode {
  return {
    type: CDataSymbol,
    content: String(children),
  }
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
