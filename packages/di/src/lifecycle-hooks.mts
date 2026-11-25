export interface OnServiceInit {
  onServiceInit(): Promise<void> | void
}

export interface OnServiceDestroy {
  onServiceDestroy(): Promise<void> | void
}
