/**
 * Дубликат app/shared/p2pCrypto.ts — держать в синхронизации (только лог relay).
 */
export const P2P_HKDF_INFO = 'codeviper-p2p-prompt-v1';
export function formatEncryptedTaskRelayLog(meta) {
    return JSON.stringify({
        event: 'p2p_task_relay',
        taskId: meta.taskId,
        targetNodeId: meta.targetNodeId,
        cipherBytes: Buffer.from(meta.payload.ciphertext, 'base64').length,
        ivBytes: Buffer.from(meta.payload.iv, 'base64').length
    });
}
export function logContainsPlaintext(logLine, plaintext) {
    return plaintext.length > 0 && logLine.includes(plaintext);
}
