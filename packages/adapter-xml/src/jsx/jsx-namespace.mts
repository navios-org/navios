/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-namespace */

/**
 * The JSX types of the package, and their only definition.
 *
 * TypeScript reads them from the `jsx-runtime` module named by
 * `jsxImportSource`, so a project needs no `types` entry for lower-case tags
 * such as `<rss>` to type-check. `@navios/adapter-xml/jsx` declares the same
 * types as the global `JSX` namespace, for setups without `jsxImportSource`.
 */
export declare namespace JSX {
  type Element = object | string | number | null | undefined | Promise<any>

  interface ElementChildrenAttribute {
    children: {}
  }

  /** What can appear between the tags of an element. */
  type Child = Element | Element[] | string | number | boolean | null | undefined

  type BaseTagProps = {
    key?: string | number
    [prop: string]: string | number | boolean | null | undefined | Child | Child[]
  }

  interface IntrinsicElements {
    // Any XML tag name, with any props.
    [tagName: string]: BaseTagProps
  }

  /** Class components: `render(ctx)` receives the request context. */
  interface ElementClass {
    render(ctx: any): Element | Promise<Element>
  }

  interface IntrinsicAttributes {
    key?: string | number
  }
}
