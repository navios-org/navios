export class NaviosException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NaviosException'
  }
}
