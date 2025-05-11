import { z } from 'zod'

import { AttributeFactory } from '../../../../src/index.mjs'

export const PublicSymbol = Symbol.for('Public')

export const Public = AttributeFactory.createAttribute(PublicSymbol)
export const RolesSymbol = Symbol.for('Roles')

export const RolesSchema = z.object({
  roles: z.array(
    z.union([
      z.literal('VIEWER'),
      z.literal('USER'),
      z.literal('ADMIN'),
      z.literal('OWNER'),
    ]),
  ),
})

export const Roles = AttributeFactory.createAttribute(RolesSymbol, RolesSchema)
