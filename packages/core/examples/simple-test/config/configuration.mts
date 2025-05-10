import { envInt } from '../../../src/index.mjs'

export function configureConfig() {
  return {
    port: envInt('PORT', 4250),
  }
}
