/**
 * Names the kind of a value, for a message about one that cannot be used.
 * @internal
 */
export function describeValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'an array'
  }
  if (typeof value === 'object') {
    const name = Object.getPrototypeOf(value)?.constructor?.name
    return name === undefined || name === 'Object' ? 'a plain object' : `an object of class ${name}`
  }
  return `a value of type ${typeof value}`
}
