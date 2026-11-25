import { AttributeFactory } from '@navios/server'
import { z } from 'zod'

export const Public = AttributeFactory.createAttribute(Symbol.for('Public'))

export const Roles = AttributeFactory.createAttribute(
  Symbol.for('Roles'),
  z.object({
    roles: z.array(z.enum(['VIEWER', 'USER', 'ADMIN', 'OWNER'])),
  }),
)
