export const CDataSymbol = Symbol.for('xml.cdata')

/** Represents a CDATA section - content is wrapped in <![CDATA[...]]> */
export interface CDataNode {
  type: typeof CDataSymbol
  content: string
}

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
