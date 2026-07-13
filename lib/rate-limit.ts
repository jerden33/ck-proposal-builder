// Basic in-memory, per-IP sliding-window throttle for public endpoints.
// Best-effort: state is per server instance and resets on cold start/redeploy,
// which is an acceptable tradeoff for a low-volume public form.
const hits = new Map<string, number[]>()

export function isRateLimited(key: string, limit = 5, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now()
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs)

  if (timestamps.length >= limit) {
    hits.set(key, timestamps)
    return true
  }

  timestamps.push(now)
  hits.set(key, timestamps)

  // Opportunistically prevent unbounded growth across many distinct IPs.
  if (hits.size > 5000) {
    Array.from(hits.entries()).forEach(([k, v]) => {
      if (v.every((t) => now - t > windowMs)) hits.delete(k)
    })
  }

  return false
}
