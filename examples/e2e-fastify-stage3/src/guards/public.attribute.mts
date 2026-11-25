import { AttributeFactory } from '@navios/server'

export const PublicToken = Symbol.for('Public')
export const Public = AttributeFactory.createAttribute(PublicToken)
