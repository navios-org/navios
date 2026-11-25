const MEDIA_TYPE = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/

/** The media type of a `Content-Type`, in lower case, or `undefined` for what is not one. */
export function mediaType(contentType: string | undefined): string | undefined {
  if (contentType === undefined) {
    return undefined
  }
  const end = contentType.indexOf(';')
  const type = (end < 0 ? contentType : contentType.slice(0, end)).trim().toLowerCase()
  return MEDIA_TYPE.test(type) ? type : undefined
}

export function isJsonType(type: string): boolean {
  return type === 'application/json' || type.endsWith('+json')
}
