import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes
} from 'node:crypto'

/** HKDF info для вывода симметричного ключа сессии P2P */
export const P2P_HKDF_INFO = 'codeviper-p2p-prompt-v1'

export interface P2pEncryptedPayload {
  /** Ephemeral X25519 public key (SPKI DER, base64) */
  ephemeralPublicKey: string
  ciphertext: string
  iv: string
  authTag: string
}

export interface P2pNodeKeys {
  publicKey: string
  privateKey: string
}

export function generateP2pNodeKeys(): P2pNodeKeys {
  const pair = generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  })
  return {
    publicKey: pair.publicKey.toString('base64'),
    privateKey: pair.privateKey.toString('base64')
  }
}

export function deriveP2pSessionKey(privateKeyDer: Buffer, peerPublicKeySpkiDer: Buffer): Buffer {
  const privateKey = createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' })
  const publicKey = createPublicKey({ key: peerPublicKeySpkiDer, format: 'der', type: 'spki' })
  const shared = diffieHellman({ privateKey, publicKey })
  return Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), P2P_HKDF_INFO, 32))
}

/** Шифрует промпт ECDH (ephemeral) + AES-256-GCM для публичного ключа получателя. */
export function encryptP2pPrompt(
  plaintext: string,
  recipientPublicKeyB64: string
): P2pEncryptedPayload {
  const ephemeral = generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  })
  const sessionKey = deriveP2pSessionKey(
    ephemeral.privateKey,
    Buffer.from(recipientPublicKeyB64, 'base64')
  )
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sessionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    ephemeralPublicKey: ephemeral.publicKey.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  }
}

/** Расшифровывает тело промпта приватным ключом узла-получателя. */
export function decryptP2pPrompt(
  payload: P2pEncryptedPayload,
  recipientPrivateKeyB64: string
): string {
  const sessionKey = deriveP2pSessionKey(
    Buffer.from(recipientPrivateKeyB64, 'base64'),
    Buffer.from(payload.ephemeralPublicKey, 'base64')
  )
  const decipher = createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'))
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ])
  return plain.toString('utf8')
}

/** Лог relay без plaintext — только метаданные шифротекста. */
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

/** true, если строка лога содержит переданный plaintext (для тестов). */
export function logContainsPlaintext(logLine: string, plaintext: string): boolean {
  return plaintext.length > 0 && logLine.includes(plaintext)
}

/** Приводит URL сигнального сервера / узла к HTTPS/WSS. */
export function toSecureP2pUrl(url: string): string {
  const u = new URL(url)
  if (u.protocol === 'http:') u.protocol = 'https:'
  if (u.protocol === 'ws:') u.protocol = 'wss:'
  return u.toString().replace(/\/$/, '')
}

/** WebSocket URL для подписки узла на входящие задачи. */
export function toP2pWssSubscribeUrl(baseUrl: string, nodeId: string, token: string): string {
  const secure = toSecureP2pUrl(baseUrl)
  const u = new URL(secure)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'wss:'
  u.pathname = '/nodes/ws'
  u.searchParams.set('nodeId', nodeId)
  u.searchParams.set('token', token)
  return u.toString()
}
