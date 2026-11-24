import { AttributeFactory } from '@navios/core/legacy-compat'

export const PublicToken = Symbol.for('Public')
export const Public = AttributeFactory.createAttribute(PublicToken)
