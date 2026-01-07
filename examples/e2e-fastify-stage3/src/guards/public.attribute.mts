import { AttributeFactory } from '@navios/core'

export const PublicToken = Symbol('Public')
export const Public = AttributeFactory.createAttribute(PublicToken)
