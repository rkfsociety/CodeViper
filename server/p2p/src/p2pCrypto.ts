/**
 * Дубликат app/shared/p2pCrypto.ts — держать в синхронизации.
 */
import {
  createCipheriv,
  createDecipheriv,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes
} from 'node:crypto'

export const P2P_HKDF_INFO = 'codeviper-p2p-prompt-v1'

export interface P2pEncryptedPayload {
  ephemeralPublicKey: string
  ciphertext: string
  iv: string
  authTag: string
}

export function formatEncryptedTaskRelayLog(meta: {
  taskId: string
  targetNodeId: string
  payload: P2pEncryptedPayload
}): string {
  return JSON.stringify({
    event: 'p2p_task_relay',
    taskId: meta.taskId,
    targetNodeId: meta.targetNodeId,
    cipherBytes: Buffer.from(meta.payload.ciphertext, 'base64').length,
    ivBytes: Buffer.from(meta.payload.iv, 'base64').length
  })
}

export function logContainsPlaintext(logLine: string, plaintext: string): boolean {
  return plaintext.length > 0 && logLine.includes(plaintext)
}
