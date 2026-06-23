import jwt from 'jsonwebtoken';
const { sign, verify } = jwt;
import { hash, compare } from 'bcryptjs';
import { randomUUID } from 'crypto';
// ─── Auth store (Redis or in-memory) ──────────────────────────────────────
class AuthStore {
    redis;
    mem = new Map();
    constructor(redis) {
        this.redis = redis;
    }
    async set(key, value, ttlSec) {
        if (this.redis) {
            if (ttlSec)
                await this.redis.set(key, value, 'EX', ttlSec);
            else
                await this.redis.set(key, value);
        }
        else {
            this.mem.set(key, value);
        }
    }
    async get(key) {
        if (this.redis)
            return this.redis.get(key);
        return this.mem.get(key) ?? null;
    }
    async del(key) {
        if (this.redis)
            await this.redis.del(key);
        else
            this.mem.delete(key);
    }
    async incr(key, ttlSec) {
        if (this.redis) {
            const val = await this.redis.incr(key);
            if (val === 1)
                await this.redis.expire(key, ttlSec);
            return val;
        }
        const now = Date.now();
        const raw = this.mem.get(key);
        const entry = raw ? JSON.parse(raw) : null;
        if (!entry || now > entry.expiresAt) {
            const fresh = { count: 1, expiresAt: now + ttlSec * 1000 };
            this.mem.set(key, JSON.stringify(fresh));
            return 1;
        }
        entry.count += 1;
        this.mem.set(key, JSON.stringify(entry));
        return entry.count;
    }
}
// ─── AuthManager ────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 10;
const JWT_EXPIRY = '24h';
const RATE_WINDOW_SEC = 60;
export class AuthManager {
    store;
    secret;
    rateLimitPerMin;
    githubClientId;
    githubClientSecret;
    constructor(redis) {
        this.store = new AuthStore(redis);
        this.secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
        this.rateLimitPerMin = parseInt(process.env.RATE_LIMIT_PER_MIN ?? '60', 10);
        this.githubClientId = process.env.GITHUB_CLIENT_ID ?? '';
        this.githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? '';
        if (this.secret === 'dev-secret-change-in-production') {
            console.warn('[auth] ⚠️  JWT_SECRET not set — using insecure dev secret');
        }
    }
    // ── Email registration ────────────────────────────────────────────────────
    async register(email, password) {
        const emailKey = `email:${email.toLowerCase()}`;
        const existing = await this.store.get(emailKey);
        if (existing)
            throw new Error('Email already registered');
        const userId = randomUUID();
        const passwordHash = await hash(password, BCRYPT_ROUNDS);
        const user = { id: userId, email, passwordHash, provider: 'email', createdAt: Date.now() };
        await this.store.set(`user:${userId}`, JSON.stringify(user));
        await this.store.set(emailKey, userId);
        const token = this.issueToken(userId, 'email');
        return { token, userId };
    }
    // ── Email login ───────────────────────────────────────────────────────────
    async login(email, password) {
        const userId = await this.store.get(`email:${email.toLowerCase()}`);
        if (!userId)
            throw new Error('Invalid credentials');
        const raw = await this.store.get(`user:${userId}`);
        if (!raw)
            throw new Error('Invalid credentials');
        const user = JSON.parse(raw);
        if (!user.passwordHash)
            throw new Error('Invalid credentials');
        const ok = await compare(password, user.passwordHash);
        if (!ok)
            throw new Error('Invalid credentials');
        const token = this.issueToken(userId, 'email');
        return { token, userId };
    }
    // ── GitHub OAuth ──────────────────────────────────────────────────────────
    githubAuthUrl(state) {
        if (!this.githubClientId)
            throw new Error('GITHUB_CLIENT_ID not configured');
        const params = new URLSearchParams({
            client_id: this.githubClientId,
            scope: 'read:user user:email',
            state
        });
        return `https://github.com/login/oauth/authorize?${params}`;
    }
    async exchangeGithubCode(code) {
        if (!this.githubClientId || !this.githubClientSecret) {
            throw new Error('GitHub OAuth not configured (set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)');
        }
        // Exchange code for access token
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: this.githubClientId,
                client_secret: this.githubClientSecret,
                code
            })
        });
        const tokenData = (await tokenRes.json());
        if (!tokenData.access_token) {
            throw new Error(`GitHub token exchange failed: ${tokenData.error ?? 'unknown'}`);
        }
        // Fetch GitHub user info
        const userRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'CodeViper-P2P' }
        });
        const ghUser = (await userRes.json());
        if (!ghUser.id)
            throw new Error('Failed to fetch GitHub user info');
        const githubId = String(ghUser.id);
        const ghKey = `github:${githubId}`;
        let userId = await this.store.get(ghKey);
        if (!userId) {
            userId = randomUUID();
            const user = {
                id: userId,
                githubId,
                email: ghUser.email ?? undefined,
                provider: 'github',
                createdAt: Date.now()
            };
            await this.store.set(`user:${userId}`, JSON.stringify(user));
            await this.store.set(ghKey, userId);
        }
        const token = this.issueToken(userId, 'github');
        return { token, userId };
    }
    // ── Token verification ────────────────────────────────────────────────────
    verifyToken(token) {
        try {
            return verify(token, this.secret);
        }
        catch {
            return null;
        }
    }
    // ── Rate limiting ─────────────────────────────────────────────────────────
    async checkRateLimit(userId) {
        const key = `rl:${userId}`;
        const count = await this.store.incr(key, RATE_WINDOW_SEC);
        const remaining = Math.max(0, this.rateLimitPerMin - count);
        return { allowed: count <= this.rateLimitPerMin, remaining };
    }
    // ─────────────────────────────────────────────────────────────────────────
    issueToken(userId, provider) {
        return sign({ sub: userId, provider }, this.secret, {
            expiresIn: JWT_EXPIRY
        });
    }
}
