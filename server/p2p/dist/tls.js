import { readFileSync } from 'node:fs';
/** Загружает TLS-сертификаты из TLS_KEY_PATH / TLS_CERT_PATH. */
export function loadTlsOptions() {
    const keyPath = process.env.TLS_KEY_PATH?.trim();
    const certPath = process.env.TLS_CERT_PATH?.trim();
    if (!keyPath || !certPath)
        return null;
    return {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath)
    };
}
