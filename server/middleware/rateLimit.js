const buckets = new Map()

function cleanupExpiredBuckets(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function rateLimit({ windowMs = 60_000, max = 60, name = 'default' } = {}) {
  return (request, response, next) => {
    const now = Date.now()
    cleanupExpiredBuckets(now)

    const actor = request.user?.id ?? request.ip ?? 'anonymous'
    const key = `${name}:${actor}`
    const bucket = buckets.get(key) ?? {
      count: 0,
      resetAt: now + windowMs,
    }

    bucket.count += 1
    buckets.set(key, bucket)

    response.setHeader('X-RateLimit-Limit', String(max))
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > max) {
      response.status(429).json({
        error: 'Too many requests. Please wait and try again.',
        code: 'RATE_LIMITED',
      })
      return
    }

    next()
  }
}
