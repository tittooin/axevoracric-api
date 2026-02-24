import { Context, Next } from 'hono';

// Quota Definitions based on Plan
const PLAN_LIMITS: Record<string, { rpm: number; rpd: number }> = {
    free: { rpm: 50, rpd: 1000 },
    basic: { rpm: 60, rpd: 50000 },
    pro: { rpm: 1000, rpd: 500000 },
    elite: { rpm: 999999, rpd: 999999999 },
};

export async function rateLimitAndQuota(c: Context, next: Next) {
    const kv = c.env.USAGE_KV as KVNamespace;

    // These variables are injected by the previous authMiddleware
    const plan = c.get('userPlan') || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['free'];
    const userEmail = c.get('userEmail');

    // If somehow not authenticated, skip limits (authMiddleware block handles it first anyway)
    if (!userEmail) return next();

    const now = new Date();
    const minuteKey = `rate_limit:${userEmail}:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}:${now.getUTCMinutes()}`;
    const dailyKey = `quota:${userEmail}:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

    // 1. Check Per-Minute Rate Limit (Sliding/Fixed Window)
    const currentRpmStr = await kv.get(minuteKey);
    let currentRpm = currentRpmStr ? parseInt(currentRpmStr, 10) : 0;

    if (currentRpm >= limits.rpm) {
        c.header('X-RateLimit-Limit', limits.rpm.toString());
        c.header('X-RateLimit-Remaining', '0');
        c.header('Retry-After', '60');
        return c.json({ success: false, error: 'Too many requests - Please slow down (Per-Minute Limit Reached)' }, 429);
    }

    // 2. Check Daily Quota Limit
    const currentRpdStr = await kv.get(dailyKey);
    let currentRpd = currentRpdStr ? parseInt(currentRpdStr, 10) : 0;

    if (currentRpd >= limits.rpd) {
        c.header('X-Quota-Limit', limits.rpd.toString());
        c.header('X-Quota-Remaining', '0');
        return c.json({ success: false, error: 'Daily API quota exceeded. Upgrade your plan or try again tomorrow.' }, 429);
    }

    // Attach headers for remaining allowed requests before incrementing
    c.header('X-RateLimit-Limit', limits.rpm.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, limits.rpm - currentRpm - 1).toString());

    c.header('X-Quota-Limit', limits.rpd.toString());
    c.header('X-Quota-Remaining', Math.max(0, limits.rpd - currentRpd - 1).toString());

    // Proceed to the actual route handler!
    await next();

    // 3. Post-Request Tracking: Only increment usage if the request succeeded (status 200)
    if (c.res.status === 200) {
        // Increment Minute
        c.executionCtx.waitUntil(kv.put(minuteKey, (currentRpm + 1).toString(), { expirationTtl: 120 })); // expires in 2 mins
        // Increment Daily
        c.executionCtx.waitUntil(kv.put(dailyKey, (currentRpd + 1).toString(), { expirationTtl: 86400 * 2 })); // expires in 2 days
    }
}
