import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middlewares/auth'
import { rateLimitAndQuota } from './middlewares/rateLimiter'
import { hashPassword, generateRawKey, hashApiKey } from './utils/crypto'
import { fetchAllSources } from './sources'
import { ingestMatches } from './services/ingestion'
import { KV_KEYS } from './utils/kv'

type Bindings = {
    DB: D1Database
    USAGE_KV: KVNamespace
}

type Variables = {
    userEmail: string
    userPlan: string
    keyName: string
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-quota-limit', 'x-quota-remaining'],
    maxAge: 600,
    credentials: true,
}))

app.get('/', (c) => {
    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fantasy Cricket API - Cloudflare Edge</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        
        :root {
            --primary: #00ff88;
            --secondary: #00a1ff;
            --dark: #0a0b10;
            --card-bg: rgba(255, 255, 255, 0.03);
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--dark);
            color: white;
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background-image: 
                radial-gradient(circle at 15% 50%, rgba(0, 255, 136, 0.15), transparent 25%),
                radial-gradient(circle at 85% 30%, rgba(0, 161, 255, 0.15), transparent 25%);
        }

        .container {
            width: 100%;
            max-width: 800px;
            padding: 2rem;
            z-index: 10;
        }

        .glass-panel {
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 24px;
            padding: 2.5rem;
            box-shadow: 0 30px 60px rgba(0,0,0,0.4);
            margin-bottom: 2rem;
            transition: transform 0.3s ease;
        }
        
        .glass-panel:hover {
            transform: translateY(-5px);
            border-color: rgba(255, 255, 255, 0.1);
        }

        h1 {
            font-weight: 800;
            font-size: 2.5rem;
            margin-top: 0;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
            margin-bottom: 0.5rem;
        }
        
        p.subtitle {
            text-align: center;
            color: #8892b0;
            margin-bottom: 2.5rem;
            font-size: 1.1rem;
        }

        .form-group {
            margin-bottom: 1.5rem;
        }

        label {
            display: block;
            margin-bottom: 0.5rem;
            color: #a8b2d1;
            font-size: 0.9rem;
            font-weight: 600;
        }

        input {
            width: 100%;
            padding: 1rem;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(0, 0, 0, 0.2);
            color: white;
            font-family: inherit;
            font-size: 1rem;
            box-sizing: border-box;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(0, 255, 136, 0.2);
        }

        button {
            width: 100%;
            padding: 1rem;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: var(--dark);
            font-weight: 800;
            font-size: 1.1rem;
            cursor: pointer;
            box-shadow: 0 10px 20px rgba(0, 161, 255, 0.2);
            transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 25px rgba(0, 161, 255, 0.4);
        }
        
        button:active {
            transform: translateY(1px);
        }

        .result-box {
            margin-top: 1.5rem;
            padding: 1.5rem;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            border: 1px dashed rgba(255, 255, 255, 0.2);
            display: none;
            word-wrap: break-word;
        }
        
        pre {
            margin: 0;
            white-space: pre-wrap;
            color: #e2e8f0;
            font-size: 0.9rem;
        }

        .success-text {
            color: var(--primary);
            font-weight: 600;
            margin-bottom: 0.5rem;
        }

        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.5rem;
        }

        @media (max-width: 600px) {
            .grid-2 {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>

<div class="container">
    <div class="glass-panel">
        <h1>Dev Dashboard</h1>
        <p class="subtitle">Cloudflare Workers + D1 Powered Backend</p>

        <form id="setupForm">
            <div class="grid-2">
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="email" value="tester@edge.com" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="password" value="secret" required>
                </div>
            </div>
            <button type="submit" id="genBtn">Generate API Key</button>
        </form>

        <div id="keyResult" class="result-box"></div>
    </div>

    <div class="glass-panel" id="testPanel" style="opacity: 0.5; pointer-events: none;">
        <h2 style="margin-top:0">2. Test API Enforcement</h2>
        <p style="color: #a8b2d1; font-size: 0.9rem; margin-bottom: 1.5rem">Hit the protected /api/v1/matches endpoint using your generated key.</p>
        <button id="testMatchBtn" style="background: transparent; border: 2px solid var(--secondary); color: white;">Fetch Matches 🏏</button>
        <div id="matchResult" class="result-box"></div>
    </div>
</div>

<script>
    let currentApiKey = '';

    document.getElementById('setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('genBtn');
        const resultBox = document.getElementById('keyResult');
        
        btn.innerText = 'Provisioning...';
        btn.style.opacity = '0.8';
        
        try {
            const res = await fetch('/api/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('email').value,
                    password: document.getElementById('password').value,
                    name: 'Dashboard Key',
                    plan: 'pro'
                })
            });
            
            const data = await res.json();
            
            if(data.success) {
                currentApiKey = data.data.rawKey;
                resultBox.style.display = 'block';
                resultBox.style.borderColor = 'var(--primary)';
                resultBox.innerHTML = \`<div class="success-text">✅ Key Generated Successfully!</div>
                <div style="font-family: monospace; background: rgba(0,255,136,0.1); padding: 10px; border-radius: 6px; margin-top: 10px; border: 1px solid rgba(0,255,136,0.2)">\${currentApiKey}</div>\`;
                
                // Unlock testing panel
                const testPanel = document.getElementById('testPanel');
                testPanel.style.opacity = '1';
                testPanel.style.pointerEvents = 'all';
            } else {
                resultBox.style.display = 'block';
                resultBox.style.borderColor = '#ff3366';
                resultBox.innerHTML = \`<div style="color: #ff3366">❌ Error: \${data.error}</div>\`;
            }
        } catch(err) {
            resultBox.style.display = 'block';
            resultBox.innerHTML = 'Network Error';
        }
        
        btn.innerText = 'Generate API Key';
        btn.style.opacity = '1';
    });

    document.getElementById('testMatchBtn').addEventListener('click', async () => {
        const btn = document.getElementById('testMatchBtn');
        const resultBox = document.getElementById('matchResult');
        
        btn.innerText = 'Fetching...';
        
        try {
            const res = await fetch('/api/v1/matches', {
                headers: { 'x-api-key': currentApiKey }
            });
            
            const data = await res.json();
            const rlLimit = res.headers.get('x-ratelimit-limit');
            const rlRemain = res.headers.get('x-ratelimit-remaining');
            const quotaLimit = res.headers.get('x-quota-limit');
            const quotaRemain = res.headers.get('x-quota-remaining');

            resultBox.style.display = 'block';
            
            if(res.ok && data.success) {
                resultBox.style.borderColor = 'var(--secondary)';
                resultBox.innerHTML = \`<div style="color:var(--secondary); font-weight:600; margin-bottom:10px;">✅ Authorized (Plan: \${data.user.plan})</div>
                <div style="display:flex; gap: 15px; margin-bottom: 15px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                    <div><span style="color:#a8b2d1; font-size:0.8rem">RPM RM:</span> <b style="color:#00ff88">\${rlRemain}/\${rlLimit}</b></div>
                    <div><span style="color:#a8b2d1; font-size:0.8rem">Daily RM:</span> <b style="color:#00a1ff">\${quotaRemain}/\${quotaLimit}</b></div>
                </div>
                <pre>\${JSON.stringify(data.data, null, 2)}</pre>\`;
            } else {
                resultBox.style.borderColor = '#ff3366';
                resultBox.innerHTML = \`<div style="color: #ff3366; font-weight: 600; margin-bottom: 5px;">❌ \${res.status} - Rate Limited</div>
                <div style="color: #e2e8f0; font-size: 0.9rem">\${data.error || 'Too many requests'}</div>\`;
            }
        } catch(err) {
            resultBox.style.display = 'block';
            resultBox.innerHTML = 'Network Error';
        }
        
        btn.innerText = 'Fetch Matches 🏏';
    });
</script>
</body>
</html>
  `)
})

app.post('/api/dummy', async (c) => {
    return c.json({ ping: 'pong' })
})

app.post('/api/setup', async (c) => {
    try {
        const body = await c.req.json()
        const { email, password, name, plan = 'free' } = body

        if (!email || !password) {
            return c.json({ success: false, error: 'Email and password required' }, 400)
        }

        const db = c.env.DB

        // Check if user exists
        const existingUser = await db.prepare('SELECT id FROM Users WHERE email = ?').bind(email).first()

        let userId = existingUser?.id as string

        if (!existingUser) {
            // Create new user
            userId = crypto.randomUUID()
            const hashedPassword = await hashPassword(password)

            await db.prepare('INSERT INTO Users (id, email, password_hash, plan) VALUES (?, ?, ?, ?)')
                .bind(userId, email, hashedPassword, plan)
                .run()
        }

        // Generate API Key
        const keyId = crypto.randomUUID()
        const rawSecret = generateRawKey()
        const hashedSecret = await hashApiKey(rawSecret)

        await db.prepare('INSERT INTO ApiKeys (id, key_hash, user_id, name) VALUES (?, ?, ?, ?)')
            .bind(keyId, hashedSecret, userId, name || 'Default Key')
            .run()

        const fullKey = `${keyId}.${rawSecret}`

        return c.json({
            success: true,
            message: 'User and API Key created. Keep this key safe!',
            data: {
                name: name || 'Default Key',
                rawKey: fullKey,
                isActive: true,
                createdAt: new Date().toISOString()
            }
        }, 201)

    } catch (error: any) {
        console.error('Setup Error:', error)
        return c.json({ success: false, error: error.message }, 500)
    }
})

import matches from './routes/matches'
import series from './routes/series'
import { teams, players } from './routes/others'
import { news, stats, venues } from './routes/more'

// ... (existing Setup route)

// Mount Sub-Routers
app.route('/api/v1/matches', matches)
app.route('/api/v1/series', series)
app.route('/api/v1/teams', teams)
app.route('/api/v1/players', players)
app.route('/api/v1/news', news)
app.route('/api/v1/stats', stats)
app.route('/api/v1/venues', venues)

// --- AGGREGATED ALL-IN-ONE ENDPOINT (Real Data) ---
app.get('/api/v1/all', authMiddleware, rateLimitAndQuota, async (c) => {
    const db = c.env.DB;

    // Fetch real matches directly from DB for the monitor
    const { results } = await db.prepare(
        "SELECT id, source_match_id, team_a, team_b, status, start_time, source, provider_updated_at FROM matches WHERE status IN ('live', 'scheduled', 'completed') ORDER BY start_time DESC LIMIT 100"
    ).all();

    const liveMatches = results.filter(m => m.status === 'live');
    const upcomingMatches = results.filter(m => m.status === 'scheduled');
    const recentMatches = results.filter(m => m.status === 'completed');

    return c.json({
        success: true,
        data: {
            live: liveMatches,
            upcoming: upcomingMatches,
            recent: recentMatches,
            timestamp: new Date().toISOString()
        }
    });
});

// --- INGESTION PUSH API (Phase 16) ---
app.post('/api/v1/ingest/push', async (c) => {
    try {
        const authHeader = c.req.header('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        // In production, this should be a secret environment variable
        // We'll use a placeholder for now and check c.env.INGESTION_TOKEN later
        const secretToken = (c.env as any).INGESTION_TOKEN || 'axevora_test_secret_123';

        if (token !== secretToken) {
            return c.json({ success: false, error: 'Unauthorized: Invalid Ingestion Token' }, 401);
        }

        const body = await c.req.json();
        const { matches: sourceMatches } = body;

        if (!Array.isArray(sourceMatches)) {
            return c.json({ success: false, error: 'Invalid payload: "matches" array expected' }, 400);
        }

        // Mocking a source result structure for the existing ingestion service
        const sourceResult = {
            name: 'relay_source',
            matches: sourceMatches,
            priority: 1
        };

        const result = await ingestMatches(c.env.DB, c.env.USAGE_KV, [sourceResult]);

        return c.json({
            success: true,
            message: 'Relay Data Ingested Successfully',
            data: {
                received: sourceMatches.length,
                ingested: result.totalSent,
                timestamp: new Date().toISOString()
            }
        });

    } catch (err: any) {
        console.error('[Push API Error]:', err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

// --- DEBUG MANUAL TRIGGER ---
app.get('/api/v1/debug/ingest-now', async (c) => {
    try {
        // Auto-clear lock for debug trigger to avoid overlap issues
        await c.env.USAGE_KV.delete(KV_KEYS.INGESTION_LOCK);
        // Wait a bit for KV propagation
        await new Promise(resolve => setTimeout(resolve, 2000));

        const results = await handleScheduled({}, c.env, {} as any, true);
        return c.json({ success: true, message: "Manual Ingestion Triggered (FORCE V2)", data: results });
    } catch (err: any) {
        return c.json({ success: false, error: err.message }, 500);
    }
});

// --- CRON / Scheduled Worker Handler ---
async function handleScheduled(event: any, env: Bindings, ctx: ExecutionContext, forceAll = false) {
    const startTime = Date.now();
    const lockKey = KV_KEYS.INGESTION_LOCK;
    const ownerToken = crypto.randomUUID();

    let metrics = {
        lockAcquisitionAttempt: true,
        lockAcquired: false,
        lockRejected: false,
        lockOwnershipMismatch: false,
        sourcesAttempted: forceAll ? 3 : 1,
        totalMatchesFetched: 0,
        ingestedCount: 0,
        durationMs: 0,
        kvWriteSuccess: false,
        skippedDueToLock: false
    };

    try {
        console.log(`[Cron] Ingestion started at ${new Date().toISOString()}`);

        // --- HARDENED KV LOCK ---
        const existingLock = await env.USAGE_KV.get(lockKey, { type: 'json' }) as { owner: string; ts: number } | null;
        if (existingLock && !forceAll) {
            metrics.skippedDueToLock = true;
            metrics.lockRejected = true;
            console.warn(`[Cron] Lock already present. Owner: ${existingLock.owner}. Skipping.`);
            return metrics;
        }

        // Put token (Always do this unless we want to bypass lock completely, but here we just bypass the 'skip' if forceAll)
        const lockData = { owner: ownerToken, ts: Date.now() };
        await env.USAGE_KV.put(lockKey, JSON.stringify(lockData), { expirationTtl: 60 });

        // Verify lock
        const verifiedLock = await env.USAGE_KV.get(lockKey, { type: 'json' }) as { owner: string; ts: number } | null;
        if (!verifiedLock || verifiedLock.owner !== ownerToken) {
            metrics.lockOwnershipMismatch = true;
            metrics.lockRejected = true;
            console.error(`[Cron] Lock Ownership Mismatch! Expected: ${ownerToken}, Found: ${verifiedLock?.owner}`);
            return metrics;
        }

        metrics.lockAcquired = true;

        // --- INGESTION FLOW ---
        const sourceResults = await fetchAllSources(env.USAGE_KV, forceAll);
        metrics.totalMatchesFetched = sourceResults.reduce((acc, r) => acc + r.matches.length, 0);

        if (metrics.totalMatchesFetched > 0) {
            const result = await ingestMatches(env.DB, env.USAGE_KV, sourceResults);
            metrics.ingestedCount = result.totalSent;
            metrics.kvWriteSuccess = true;
        }

        metrics.durationMs = Date.now() - startTime;
        console.log(`[Cron] Elite Pipeline metrics:`, JSON.stringify(metrics, null, 2));

        // --- BEST EFFORT RELEASE ---
        const currentLock = await env.USAGE_KV.get(lockKey, { type: 'json' }) as { owner: string; ts: number } | null;
        if (currentLock && currentLock.owner === ownerToken) {
            await env.USAGE_KV.delete(lockKey);
            console.log(`[Cron] Lock released successfully.`);
        }

        return metrics;
    } catch (err: any) {
        console.error(`[Cron] Critical Pipeline Failure:`, err);
        return { ...metrics, error: err.message, durationMs: Date.now() - startTime };
    }
}

// Fixed Export for Cloudflare Workers (Module Syntax)
export default {
    fetch: app.fetch,
    async scheduled(event: any, env: Bindings, ctx: ExecutionContext) {
        await handleScheduled(event, env, ctx);
    }
};
