import { AttributeFactory } from '@navios/core/legacy-compat'

import { ApiSecuritySchema, ApiSecurityToken } from '../annotations/api-security.mjs'

export const ApiSecurity = AttributeFactory.createAttribute(ApiSecurityToken, ApiSecuritySchema)
