import { AttributeFactory } from '../../../../src/index.mjs'

export const PublicSymbol = Symbol.for('Public')

export const Public = AttributeFactory.createAttribute(PublicSymbol)
