/**
 * Renders content as CDATA section.
 * If content contains "]]>", splits into multiple CDATA sections.
 * The technique is to end the CDATA section before ]]>, then start a new one.
 */
export function renderCData(content: string): string {
  // Handle the edge case where content contains "]]>"
  // We split on "]]>" and join with "]]]]><![CDATA[>" which effectively
  // ends the CDATA section after "]]" and starts a new one for ">"
  if (content.includes(']]>')) {
    // Replace ]]> with ]]]]><![CDATA[> which closes CDATA before > and reopens it
    const escaped = content.replace(/]]>/g, ']]]]><![CDATA[>')
    return `<![CDATA[${escaped}]]>`
  }
  return `<![CDATA[${content}]]>`
}

export function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
