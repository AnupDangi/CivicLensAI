type Bucket = { count: number; resetAt: number };
const state = globalThis as typeof globalThis & { __civicLensRateLimits?: Map<string, Bucket> };
const buckets = state.__civicLensRateLimits ?? new Map<string, Bucket>();
state.__civicLensRateLimits = buckets;

export function rateLimit(key: string, limit = 12, windowMs = 60_000): { allowed: boolean; remaining: number; retryAfter: number } {
  const current = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || current >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: current + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }
  if (bucket.count >= limit) return { allowed: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - current) / 1000) };
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

export function requestIdentity(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
