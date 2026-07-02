"use strict";
/**
 * Upstash Redis KV helpers — TypeScript port of api/server.js equivalents.
 * Uses KV_REST_API_URL + KV_REST_API_TOKEN (set by Vercel KV integration).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.kvGet = kvGet;
exports.kvSet = kvSet;
exports.kvDel = kvDel;
const KV_URL = () => process.env.KV_REST_API_URL;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN;
async function kvGet(key) {
    const url = KV_URL();
    const token = KV_TOKEN();
    if (!url || !token)
        return null;
    try {
        const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!data.result)
            return null;
        return JSON.parse(data.result);
    }
    catch {
        return null;
    }
}
async function kvSet(key, value, ttlSeconds = 0) {
    const url = KV_URL();
    const token = KV_TOKEN();
    if (!url || !token) {
        console.warn('[kv] KV_REST_API_URL/TOKEN not set — skip write');
        return;
    }
    try {
        const cmd = ttlSeconds > 0
            ? ['SET', key, JSON.stringify(value), 'EX', ttlSeconds]
            : ['SET', key, JSON.stringify(value)];
        await fetch(`${url}/pipeline`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([cmd]),
        });
    }
    catch (e) {
        console.error('[kv] set error:', e);
    }
}
async function kvDel(key) {
    const url = KV_URL();
    const token = KV_TOKEN();
    if (!url || !token)
        return;
    try {
        await fetch(`${url}/pipeline`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([['DEL', key]]),
        });
    }
    catch (e) {
        console.error('[kv] del error:', e);
    }
}
//# sourceMappingURL=kv.js.map