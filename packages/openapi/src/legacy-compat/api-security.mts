import { AttributeFactory } from '@navios/server/legacy-compat'

import { ApiSecuritySchema, ApiSecurityToken } from '../annotations/api-security.mjs'

export const ApiSecurity = AttributeFactory.createAttribute(ApiSecurityToken, ApiSecuritySchema)
