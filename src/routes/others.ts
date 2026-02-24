import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/auth';
import { rateLimitAndQuota } from '../middlewares/rateLimiter';

const teams = new Hono();
teams.use('*', authMiddleware, rateLimitAndQuota);
const stdRes = (c: any, data: any) => c.json({ success: true, data });

teams.get('/list', (c) => stdRes(c, []));
teams.get('/get-schedules', (c) => stdRes(c, []));
teams.get('/get-results', (c) => stdRes(c, []));
teams.get('/get-news', (c) => stdRes(c, []));
teams.get('/get-players', (c) => stdRes(c, []));
teams.get('/get-stats-filters', (c) => stdRes(c, []));
teams.get('/get-stats', (c) => stdRes(c, []));

export { teams };

const players = new Hono();
players.use('*', authMiddleware, rateLimitAndQuota);

players.get('/list-trending', (c) => stdRes(c, []));
players.get('/get-career', (c) => stdRes(c, []));
players.get('/get-news', (c) => stdRes(c, []));
players.get('/get-bowling', (c) => stdRes(c, []));
players.get('/get-batting', (c) => stdRes(c, []));
players.get('/get-info', (c) => stdRes(c, []));
players.get('/search', (c) => stdRes(c, []));

export { players };
