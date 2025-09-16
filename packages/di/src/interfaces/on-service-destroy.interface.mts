export interface OnServiceDestroy {
  onServiceDestroy(): Promise<void> | void
}