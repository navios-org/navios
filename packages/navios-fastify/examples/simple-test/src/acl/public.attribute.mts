import { AttributeFactory } from '../../../../src/attribute.factory.mjs'

export const PublicSymbol = Symbol.for('Public')

export const Public = AttributeFactory.createAttribute(PublicSymbol)
