import { AttributeFactory } from '@navios/server'

export const PublicToken = Symbol('Public')
export const Public = AttributeFactory.createAttribute(PublicToken)
