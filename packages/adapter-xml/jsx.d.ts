declare global {
  namespace JSX {
    // Use a permissive Element type to avoid symbol identity issues
    // between different declaration files
    type Element = object | string | number | null | undefined | Promise<any>

    interface ElementChildrenAttribute {
      children: {}
    }

    // Child types that can appear in JSX
    type Child = Element | Element[] | string | number | boolean | null | undefined

    type BaseTagProps = {
      key?: string | number
      [prop: string]: string | number | boolean | null | undefined | Child | Child[]
    }

    interface IntrinsicElements {
      // Allow any XML tag name with any props
      [tagName: string]: BaseTagProps
    }

    // Allow function components (sync and async)
    interface ElementClass {
      render(): Element | Promise<Element>
    }

    interface IntrinsicAttributes {
      key?: string | number
    }
  }
}

export {}
