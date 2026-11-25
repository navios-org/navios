export async function loadKafkaJS(): Promise<typeof import('kafkajs')> {
  try {
    return await import('kafkajs')
  } catch {
    throw new Error('kafkajs is not installed. Please install it with: npm install kafkajs')
  }
}
