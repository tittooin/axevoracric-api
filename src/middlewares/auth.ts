import { Context, Next } from 'hono';
import { compareApiKeys } from '../utils/crypto';

export async function authMiddleware(c: Context, next: Next) {
    const apiKeyHeader = c.req.header('x-api-key');

    if (!apiKeyHeader) {
        return c.json({ success: false, error: 'x-api-key header is missing' }, 401);
    }

    const parts = apiKeyHeader.split('.');
    if (parts.length !== 2) {
        return c.json({ success: false, error: 'Invalid API Key format' }, 401);
    }

    const [keyId, rawSecret] = parts;

    try {
        const db = c.env.DB as D1Database;

        // Fetch the key and join with user to check active status
        const query = `
      SELECT k.key_hash, k.name, u.email, u.plan, u.is_active as user_active, k.is_active as key_active 
      FROM ApiKeys k 
      JOIN Users u ON k.user_id = u.id 
      WHERE k.id = ?
    `;
        const result = await db.prepare(query).bind(keyId).first();

        if (!result) {
            return c.json({ success: false, error: 'Invalid API Key' }, 401);
        }

        if (!result.user_active || !result.key_active) {
            return c.json({ success: false, error: 'Account or API Key is suspended' }, 403);
        }

        // Verify Hash
        const isValid = await compareApiKeys(rawSecret, result.key_hash as string);

        if (!isValid) {
            return c.json({ success: false, error: 'Invalid API Key' }, 401);
        }

        // Update last_used_at in background using ExecutionContext (waitUntil)
        const updateQuery = `UPDATE ApiKeys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`;
        c.executionCtx.waitUntil(db.prepare(updateQuery).bind(keyId).run());

        // Set user context
        c.set('userEmail', result.email);
        c.set('userPlan', result.plan);
        c.set('keyName', result.name);

        await next();
    } catch (err) {
        console.error('Auth Error:', err);
        return c.json({ success: false, error: 'Authentication failed' }, 500);
    }
}
