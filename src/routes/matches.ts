import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/auth';
import { rateLimitAndQuota } from '../middlewares/rateLimiter';
import { KV_KEYS } from '../utils/kv';

const matches = new Hono();

// Middleware applied to all match routes
matches.use('*', authMiddleware, rateLimitAndQuota);

// Helper for standard response
const stdRes = (c: any, data: any) => c.json({ success: true, data });

// 1. Matches Core
matches.get('/live', async (c) => {
    const cached = await c.env.USAGE_KV.get(KV_KEYS.LIVE_MATCHES);
    if (cached) return stdRes(c, JSON.parse(cached));

    const { results } = await c.env.DB.prepare(
        "SELECT * FROM matches WHERE status = 'live' ORDER BY start_time ASC"
    ).all();
    return stdRes(c, results);
});

matches.get('/upcoming', async (c) => {
    const { results } = await c.env.DB.prepare(
        "SELECT * FROM matches WHERE status = 'scheduled' ORDER BY start_time ASC LIMIT 20"
    ).all();
    return stdRes(c, results);
});

matches.get('/recent', async (c) => {
    const { results } = await c.env.DB.prepare(
        "SELECT * FROM matches WHERE status = 'completed' ORDER BY start_time DESC LIMIT 20"
    ).all();
    return stdRes(c, results);
});

// 2. Match Details (Mocked/Proxied Deep Data)
matches.get('/list', (c) => stdRes(c, []));
matches.get('/get-info', async (c) => {
    const id = c.req.query('id');
    if (!id) return c.json({ success: false, error: 'Match ID required' }, 400);

    const match = await c.env.DB.prepare(
        "SELECT * FROM matches WHERE id = ?"
    ).bind(id).first();

    if (!match) return c.json({ success: false, error: 'Match not found' }, 404);

    return stdRes(c, {
        ...match,
        squads: match.squads ? JSON.parse(match.squads as string) : null,
        lineups: match.lineups ? JSON.parse(match.lineups as string) : null,
        scorecard: match.scorecard ? JSON.parse(match.scorecard as string) : null,
        live_details: match.live_details ? JSON.parse(match.live_details as string) : null
    });
});

matches.get('/get-team', async (c) => {
    const id = c.req.query('id');
    if (!id) return c.json({ success: false, error: 'Match ID required' }, 400);

    const match = await c.env.DB.prepare(
        "SELECT team_a, team_b, squads, lineups FROM matches WHERE id = ?"
    ).bind(id).first();

    if (!match) return c.json({ success: false, error: 'Match not found' }, 404);

    return stdRes(c, {
        teams: { a: match.team_a, b: match.team_b },
        squads: match.squads ? JSON.parse(match.squads as string) : null,
        lineups: match.lineups ? JSON.parse(match.lineups as string) : null
    });
});
matches.get('/get-commentaries', (c) => stdRes(c, []));
matches.get('/get-commentaries-v2', (c) => stdRes(c, []));
matches.get('/get-overs', (c) => stdRes(c, { overs: [] }));
matches.get('/get-scorecard', async (c) => {
    const id = c.req.query('id');
    if (!id) return c.json({ success: false, error: 'Match ID required' }, 400);

    const match = await c.env.DB.prepare(
        "SELECT scorecard FROM matches WHERE id = ?"
    ).bind(id).first();

    if (!match) return c.json({ success: false, error: 'Match not found' }, 404);

    return stdRes(c, {
        scorecard: match.scorecard ? JSON.parse(match.scorecard as string) : null
    });
});
matches.get('/get-scorecard-v2', (c) => stdRes(c, { scorecard: "Advanced scorecard placeholder" }));
matches.get('/get-leanback', (c) => stdRes(c, { leanback: "Leanback data placeholder" }));

export default matches;
