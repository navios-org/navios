import { AttributeFactory } from '@navios/server/legacy-compat'

export const PublicToken = Symbol.for('Public')
export const Public = AttributeFactory.createAttribute(PublicToken)
