export async function loadSQS(): Promise<typeof import('@aws-sdk/client-sqs')> {
  try {
    return await import('@aws-sdk/client-sqs')
  } catch {
    throw new Error(
      '@aws-sdk/client-sqs is not installed. Please install it with: npm install @aws-sdk/client-sqs',
    )
  }
}

export async function loadSNS(): Promise<typeof import('@aws-sdk/client-sns')> {
  try {
    return await import('@aws-sdk/client-sns')
  } catch {
    throw new Error(
      '@aws-sdk/client-sns is not installed. Please install it with: npm install @aws-sdk/client-sns',
    )
  }
}
