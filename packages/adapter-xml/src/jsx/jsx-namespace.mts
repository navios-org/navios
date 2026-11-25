/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-namespace */

/**
 * The JSX types TypeScript reads from the `jsx-runtime` module named by
 * `jsxImportSource`. They mirror the global `JSX` namespace of the
 * `@navios/adapter-xml/jsx` types (`jsx.d.ts`), so that a project needs no
 * `types` entry for lower-case tags such as `<rss>` to type-check.
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
