/**
 * Upstash Redis KV helpers — TypeScript port of api/server.js equivalents.
 * Uses KV_REST_API_URL + KV_REST_API_TOKEN (set by Vercel KV integration).
 */

const KV_URL = () => process.env.KV_REST_API_URL
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN

export async function kvGet<T>(key: string): Promise<T | null> {
  const url = KV_URL()
  const token = KV_TOKEN()
  if (!url || !token) return null
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json() as { result?: string | null }
    if (!data.result) return null
    return JSON.parse(data.result) as T
  } catch { return null }
}

export async function kvSet(key: string, value: unknown, ttlSeconds: number = 0): Promise<void> {
  const url = KV_URL()
  const token = KV_TOKEN()
  if (!url || !token) { console.warn('[kv] KV_REST_API_URL/TOKEN not set — skip write'); return }
  try {
    const cmd: (string | number)[] = ttlSeconds > 0
      ? ['SET', key, JSON.stringify(value), 'EX', ttlSeconds]
      : ['SET', key, JSON.stringify(value)]
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([cmd]),
    })
  } catch (e) { console.error('[kv] set error:', e) }
}

export async function kvDel(key: string): Promise<void> {
  const url = KV_URL()
  const token = KV_TOKEN()
  if (!url || !token) return
  try {
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['DEL', key]]),
    })
  } catch (e) { console.error('[kv] del error:', e) }
}
