import { describe, it, expect } from 'vitest'
import {
  decryptP2pPrompt,
  encryptP2pPrompt,
  formatEncryptedTaskRelayLog,
  generateP2pNodeKeys,
  logContainsPlaintext,
  toP2pWssSubscribeUrl,
  toSecureP2pUrl
} from '../shared/p2pCrypto'

describe('p2pCrypto', () => {
  it('ECDH + AES-GCM: roundtrip промпта', () => {
    const recipient = generateP2pNodeKeys()
    const sender = generateP2pNodeKeys()
    const secret = 'секретный промпт для инференса'
    const encrypted = encryptP2pPrompt(secret, recipient.publicKey)
    const plain = decryptP2pPrompt(encrypted, recipient.privateKey)
    expect(plain).toBe(secret)
    expect(encrypted.ciphertext).not.toContain(secret)
    expect(sender.publicKey).not.toBe(encrypted.ephemeralPublicKey)
  })

  it('лог relay не содержит plaintext промпта', () => {
    const recipient = generateP2pNodeKeys()
    const secret = 'ultra-secret-prompt-42'
    const payload = encryptP2pPrompt(secret, recipient.publicKey)
    const logLine = formatEncryptedTaskRelayLog({
      taskId: 't1',
      targetNodeId: 'node-a',
      payload
    })
    expect(logContainsPlaintext(logLine, secret)).toBe(false)
    expect(logLine).toContain('cipherBytes')
  })

  it('toSecureP2pUrl переводит http→https и ws→wss', () => {
    expect(toSecureP2pUrl('http://localhost:4242/')).toBe('https://localhost:4242')
    expect(toP2pWssSubscribeUrl('https://sig.example', 'n1', 'tok')).toBe(
      'wss://sig.example/nodes/ws?nodeId=n1&token=tok'
    )
  })
})
