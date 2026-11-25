type Message = import('@aws-sdk/client-sqs').Message

export function parseMessageBody(message: Message): unknown {
  if (!message.Body) {
    return null
  }

  try {
    const body = JSON.parse(message.Body)

    // Check if this is an SNS notification wrapper
    if (body.Type === 'Notification' && body.Message) {
      return JSON.parse(body.Message)
    }

    return body
  } catch {
    return message.Body
  }
}
