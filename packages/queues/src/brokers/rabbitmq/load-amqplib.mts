export async function loadAmqplib(): Promise<typeof import('amqp-connection-manager')> {
  try {
    return await import('amqp-connection-manager')
  } catch {
    throw new Error(
      'amqp-connection-manager is not installed. Please install it with: npm install amqp-connection-manager amqplib',
    )
  }
}
