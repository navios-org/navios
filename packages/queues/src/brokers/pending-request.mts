/** A request awaiting its reply, keyed by correlation id in each broker client. */
export interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}
