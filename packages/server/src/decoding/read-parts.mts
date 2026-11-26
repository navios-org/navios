import type { BodyPart } from '../adapter/route-input.mjs'

import { malformedMultipart } from './request-errors.mjs'

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
