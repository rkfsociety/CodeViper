const nodeSockets = new Map();
export function registerNodeSocket(nodeId, socket) {
    const existing = nodeSockets.get(nodeId);
    if (existing && existing !== socket) {
        try {
            existing.close(1000, 'replaced');
        }
        catch {
            /* ignore */
        }
    }
    nodeSockets.set(nodeId, socket);
    socket.on('close', () => {
        if (nodeSockets.get(nodeId) === socket)
            nodeSockets.delete(nodeId);
    });
}
export function isNodeOnline(nodeId) {
    const socket = nodeSockets.get(nodeId);
    return socket != null && socket.readyState === 1;
}
export function deliverEncryptedTask(targetNodeId, message) {
    const socket = nodeSockets.get(targetNodeId);
    if (!socket || socket.readyState !== 1) {
        return { delivered: false, reason: 'node offline or not subscribed via WSS' };
    }
    socket.send(message);
    return { delivered: true };
}
/** Сброс (только тесты). */
export function resetWssHubForTests() {
    nodeSockets.clear();
}
