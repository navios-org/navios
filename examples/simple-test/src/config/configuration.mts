import { envInt } from '@navios/server'

export function configureConfig() {
  return {
    port: envInt('PORT', 4250),
  }
}
