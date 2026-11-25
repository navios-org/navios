import type { KafkaConfig } from './kafka-config.mjs'

export function buildSaslConfig(
  sasl: NonNullable<KafkaConfig['sasl']>,
): import('kafkajs').SASLOptions {
  switch (sasl.mechanism) {
    case 'plain':
      return {
        mechanism: 'plain',
        username: sasl.username,
        password: sasl.password,
      }
    case 'scram-sha-256':
      return {
        mechanism: 'scram-sha-256',
        username: sasl.username,
        password: sasl.password,
      }
    case 'scram-sha-512':
      return {
        mechanism: 'scram-sha-512',
        username: sasl.username,
        password: sasl.password,
      }
    case 'aws':
      return {
        mechanism: 'aws',
        authorizationIdentity: sasl.authorizationIdentity ?? '',
        accessKeyId: sasl.accessKeyId ?? '',
        secretAccessKey: sasl.secretAccessKey ?? '',
        sessionToken: sasl.sessionToken,
      }
  }
}

export function getCompressionType(config: KafkaConfig): import('kafkajs').CompressionTypes {
  const compression = config.producer?.compression ?? 'none'
  // CompressionTypes enum values: None = 0, GZIP = 1, Snappy = 2, LZ4 = 3, ZSTD = 4
  const compressionMap: Record<string, number> = {
    none: 0,
    gzip: 1,
    snappy: 2,
    lz4: 3,
    zstd: 4,
  }
  return compressionMap[compression] as import('kafkajs').CompressionTypes
}
