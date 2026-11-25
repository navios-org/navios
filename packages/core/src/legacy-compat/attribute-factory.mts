import type { InferInput, StandardSchemaV1 } from '@navios/di'

import { AttributeFactory as StandardAttributeFactory } from '../attributes/attribute-factory.mjs'

import type { AttributeApplication } from '../attributes/attribute-factory.mjs'

import { legacy } from './legacy-decorator.mjs'

import type { LegacyAnyDecorator } from './legacy-decorator.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * An attribute application usable as a legacy decorator and in
 * `handler(endpoint, { attributes: [...] }, fn)`.
 */
export type LegacyAttributeApplication = LegacyAnyDecorator &
  Pick<AttributeApplication, 'token' | 'value'>

export interface LegacyClassAttribute {
  (): LegacyAttributeApplication
  readonly token: symbol
}

export interface LegacyClassSchemaAttribute<Schema extends StandardSchemaV1> {
  (value: InferInput<Schema>): LegacyAttributeApplication
  readonly token: symbol
  readonly schema: Schema
}

function createAttribute(token: symbol): LegacyClassAttribute
function createAttribute<Schema extends StandardSchemaV1>(
  token: symbol,
  schema: Schema,
): LegacyClassSchemaAttribute<Schema>
function createAttribute(token: symbol, schema?: StandardSchemaV1): any {
  const standard: any = schema
    ? StandardAttributeFactory.createAttribute(token, schema)
    : StandardAttributeFactory.createAttribute(token)
  const attribute = (value?: unknown) => {
    const application: AttributeApplication = standard(value)
    return Object.assign(legacy(application), {
      token: application.token,
      value: application.value,
    })
  }
  return Object.assign(attribute, schema ? { token, schema } : { token })
}

/**
 * `AttributeFactory` whose attributes are legacy decorators. Reading
 * (`get`, `getAll`, `has`) is the same as the standard one.
 */
export const AttributeFactory = {
  createAttribute,
  get: StandardAttributeFactory.get,
  getAll: StandardAttributeFactory.getAll,
  has: StandardAttributeFactory.has,
}
