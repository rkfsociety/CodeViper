const KEY_PREFIX = 'credits:';
/** Стартовый баланс — дублируем константу, чтобы server не импортировал app/shared. */
export const P2P_INITIAL_CREDITS = parseInt(process.env.P2P_INITIAL_CREDITS ?? '100', 10);
export const P2P_TASK_CREDIT_COST = parseInt(process.env.P2P_TASK_CREDIT_COST ?? '10', 10);
export const P2P_TASK_CREDIT_REWARD = parseInt(process.env.P2P_TASK_CREDIT_REWARD ?? '10', 10);
export class InsufficientCreditsError extends Error {
    constructor(balance, required) {
        super(`insufficient credits: have ${balance}, need ${required}`);
        this.name = 'InsufficientCreditsError';
    }
}
const memBalances = new Map();
export function resetCreditsStoreForTests() {
    memBalances.clear();
}
export class CreditStore {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    key(userId) {
        return `${KEY_PREFIX}${userId}`;
    }
    async readRaw(userId) {
        if (this.redis) {
            const raw = await this.redis.get(this.key(userId));
            return raw != null ? parseInt(raw, 10) : null;
        }
        return memBalances.get(userId) ?? null;
    }
    async writeRaw(userId, balance) {
        const value = String(Math.max(0, balance));
        if (this.redis) {
            await this.redis.set(this.key(userId), value);
        }
        else {
            memBalances.set(userId, parseInt(value, 10));
        }
    }
    async getBalance(userId) {
        const raw = await this.readRaw(userId);
        if (raw === null) {
            await this.writeRaw(userId, P2P_INITIAL_CREDITS);
            return P2P_INITIAL_CREDITS;
        }
        return raw;
    }
    async adjust(userId, delta) {
        const current = await this.getBalance(userId);
        const next = Math.max(0, current + delta);
        await this.writeRaw(userId, next);
        return next;
    }
    /**
     * Списать у отправителя и начислить провайдеру за P2P-задачу.
     */
    async settleTask(senderUserId, providerUserId, cost = P2P_TASK_CREDIT_COST, reward = P2P_TASK_CREDIT_REWARD) {
        const senderBalance = await this.getBalance(senderUserId);
        if (senderBalance < cost) {
            throw new InsufficientCreditsError(senderBalance, cost);
        }
        const newSender = await this.adjust(senderUserId, -cost);
        const newProvider = await this.adjust(providerUserId, reward);
        return { senderBalance: newSender, providerBalance: newProvider };
    }
}
