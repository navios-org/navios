import type { InferInput, StandardSchemaIssue, StandardSchemaV1 } from '@navios/server'

import { flattenChildren } from '../jsx/create-element.mjs'

import type { XmlNode, XmlRenderable } from '../nodes/xml-node.mjs'

/**
 * Type for XML tag components created by `defineTag`.
 *
 * Tag components are functions that accept props and children, and return
 * an XML node. They also have a `tagName` property for identification.
 *
 * @template Props - The props type for the tag component.
 */
export interface TagComponent<Props> {
  (props: Props & { children?: XmlRenderable | XmlRenderable[] }): XmlNode
  tagName: string
}

/**
 * Creates a type-safe XML tag component with optional schema validation.
 *
 * @param name - The tag name (supports namespace prefixes like 'atom:link')
 * @param propsSchema - Optional Standard Schema (for example a Zod object) the
 *   attributes are checked against. It must validate synchronously. The
 *   attributes are written as given; the schema's output is not used.
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
export function defineTag(name: string): TagComponent<Record<string, unknown>>
export function defineTag<Schema extends StandardSchemaV1>(
  name: string,
  propsSchema: Schema,
): TagComponent<InferInput<Schema>>
export function defineTag(name: string, propsSchema?: StandardSchemaV1): TagComponent<any> {
  const component = (props: any): XmlNode => {
    const { children, ...rest } = props ?? {}

    if (propsSchema) {
      const result = propsSchema['~standard'].validate(rest)
      if (result instanceof Promise) {
        throw new Error(
          `[@navios/adapter-xml] The props schema of <${name}> validates asynchronously, which defineTag does not support.`,
        )
      }
      if (result.issues) {
        throw new Error(
          `[@navios/adapter-xml] Invalid props for <${name}>: ${formatIssues(result.issues)}`,
        )
      }
    }

    return { type: name, props: rest, children: flattenChildren(children) }
  }

  component.tagName = name
  return component
}

/** `path.to.prop: message` for each issue, joined with `; `. */
function formatIssues(issues: ReadonlyArray<StandardSchemaIssue>): string {
  return issues
    .map(({ path = [], message }) => {
      const at = path.map((key) => String(typeof key === 'object' ? key.key : key)).join('.')
      return at ? `${at}: ${message}` : message
    })
    .join('; ')
}
