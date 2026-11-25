/** An attribute value as returned by calling an attribute. */
export type AttributeValue = { readonly token: symbol; readonly value: unknown }

/** Sets the values of attributes on a map of them. */
export function applyAttributes(
  target: Map<symbol, unknown>,
  attributes: AttributeValue[] | undefined,
): void {
  for (const attribute of attributes ?? []) {
    target.set(attribute.token, attribute.value)
  }
}
