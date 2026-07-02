/**
 * Upstash Redis KV helpers — TypeScript port of api/server.js equivalents.
 * Uses KV_REST_API_URL + KV_REST_API_TOKEN (set by Vercel KV integration).
 */
export declare function kvGet<T>(key: string): Promise<T | null>;
export declare function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
export declare function kvDel(key: string): Promise<void>;
//# sourceMappingURL=kv.d.ts.map