import type { ZodObject, ZodRawShape } from 'zod/v4'
import type { z } from 'zod/v4'

import type { AnyXmlNode, XmlNode } from '../types/xml-node.mjs'

export interface TagComponent<Props extends Record<string, unknown>> {
  (props: Props & { children?: AnyXmlNode | AnyXmlNode[] }): XmlNode
  tagName: string
}

/**
 * Creates a type-safe XML tag component with optional Zod schema validation.
 *
 * @param name - The tag name (supports namespace prefixes like 'atom:link')
 * @param propsSchema - Optional Zod schema for validating props
 * @returns A component function that can be used in JSX
 *
 * @example
 * ```tsx
 * // Simple tag
 * const item = defineTag('item')
 * <item>Content</item>
 *
 * // Namespaced tag with Zod validation
 * const atomLink = defineTag('atom:link', z.object({
 *   href: z.string().url(),
 *   rel: z.enum(['self', 'alternate']),
 *   type: z.string().optional(),
 * }))
 * <atomLink href="https://example.com/feed" rel="self" />
 * ```
 */
export function defineTag<T extends ZodRawShape>(
  name: string,
  propsSchema?: ZodObject<T>,
): TagComponent<T extends ZodRawShape ? z.infer<ZodObject<T>> : Record<string, never>> {
  const component = (props: any): XmlNode => {
    const { children, ...rest } = props ?? {}

    // Validate props if schema provided
    if (propsSchema) {
      propsSchema.parse(rest)
    }

    return {
      type: name,
      props: rest,
      children: Array.isArray(children) ? children : children ? [children] : [],
    }
  }

  component.tagName = name
  return component as any
}
