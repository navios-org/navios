/**
 * Creates a deferred promise that can be resolved or rejected externally.
 * This is useful for creating stub holders that can be fulfilled later.
 */
export class Deferred<T> {
  public readonly promise: Promise<T>
  private _resolve!: (value: T) => void
  private _reject!: (reason?: any) => void
  private _isResolved = false
  private _isRejected = false

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  /**
   * Resolves the deferred promise with the given value.
   * @param value The value to resolve with
   * @throws Error if the promise has already been resolved or rejected
   */
  resolve(value: T): void {
    if (this._isResolved || this._isRejected) {
      throw new Error('Deferred promise has already been resolved or rejected')
    }
    this._isResolved = true
    this._resolve(value)
  }

  /**
   * Rejects the deferred promise with the given reason.
   * @param reason The reason for rejection
   * @throws Error if the promise has already been resolved or rejected
   */
  reject(reason?: any): void {
    if (this._isResolved || this._isRejected) {
      throw new Error('Deferred promise has already been resolved or rejected')
    }
    this._isRejected = true
    this._reject(reason)
  }

  /**
   * Returns true if the promise has been resolved.
   */
  get isResolved(): boolean {
    return this._isResolved
  }

  /**
   * Returns true if the promise has been rejected.
   */
  get isRejected(): boolean {
    return this._isRejected
  }

  /**
   * Returns true if the promise has been settled (resolved or rejected).
   */
  get isSettled(): boolean {
    return this._isResolved || this._isRejected
  }
}

/**
 * Creates a new deferred promise.
 * @returns A new Deferred instance
 */
export function createDeferred<T>(): Deferred<T> {
  return new Deferred<T>()
}
