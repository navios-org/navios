/** An attribute value as returned by calling an attribute. */
export type AttributeValue = { readonly token: symbol; readonly value: unknown }

/** @internal */
export function applyAttributes(
  target: Map<symbol, unknown>,
  attributes: AttributeValue[] | undefined,
): void {
  for (const attribute of attributes ?? []) {
    target.set(attribute.token, attribute.value)
  }
}
