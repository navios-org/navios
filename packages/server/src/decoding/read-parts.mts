import { ValidationError } from '../errors/validation-error.mjs'

import type { BodyPart } from '../routing/route-input.mjs'

/** The error for a multipart body that cannot be parsed. */
export function malformedMultipart(cause: unknown): ValidationError {
  const detail = cause instanceof Error ? `: ${cause.message}` : ''
  return new ValidationError('body', [{ message: `Malformed multipart body${detail}` }])
}

/** The parts of a multipart body that is in memory. */
export async function readParts(bytes: Uint8Array, contentType: string): Promise<BodyPart[]> {
  let form: FormData
  try {
    const body = bytes as Uint8Array<ArrayBuffer>
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
  } catch (error) {
    throw malformedMultipart(error)
  }
  return Array.from(form, ([name, value]) => ({ name, value }))
}
