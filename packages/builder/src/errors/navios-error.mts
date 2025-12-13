export class NaviosError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NaviosError'
  }
}

/**
 * @deprecated Use NaviosError instead. Will be removed in next major version.
 */
export const NaviosException = NaviosError
