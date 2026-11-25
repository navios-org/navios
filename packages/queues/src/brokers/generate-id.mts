/** Random id for correlation ids and for generated queue, topic and consumer group names. */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}
