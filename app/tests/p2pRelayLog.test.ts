import { describe, it, expect } from 'vitest'
import {
  formatEncryptedTaskRelayLog,
  logContainsPlaintext
} from '../../server/p2p/src/p2pCrypto.js'

describe('p2p server relay log', () => {
  it('сигнальный сервер не пишет plaintext в лог relay', () => {
    const plaintext = 'confidential-user-prompt'
    const payload = {
      ephemeralPublicKey: Buffer.from('ephemeral-key').toString('base64'),
      ciphertext: Buffer.from('not-the-plaintext').toString('base64'),
      iv: Buffer.from('iv12bytes!!').toString('base64'),
      authTag: Buffer.from('tag16bytes!!!!').toString('base64')
    }
    const logLine = formatEncryptedTaskRelayLog({
      taskId: 'task-99',
      targetNodeId: 'node-1',
      payload
    })
    expect(logContainsPlaintext(logLine, plaintext)).toBe(false)
    expect(logLine).not.toContain(plaintext)
    expect(JSON.parse(logLine).event).toBe('p2p_task_relay')
  })
})
