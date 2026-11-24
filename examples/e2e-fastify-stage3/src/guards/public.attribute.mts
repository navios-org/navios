import { AttributeFactory } from '@navios/core'

export const PublicToken = Symbol.for('Public')
export const Public = AttributeFactory.createAttribute(PublicToken)
