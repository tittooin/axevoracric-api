import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/auth';
import { rateLimitAndQuota } from '../middlewares/rateLimiter';

const series = new Hono();
series.use('*', authMiddleware, rateLimitAndQuota);
const stdRes = (c: any, data: any) => c.json({ success: true, data });

series.get('/list', (c) => stdRes(c, []));
series.get('/list-archives', (c) => stdRes(c, []));
series.get('/get-matches', (c) => stdRes(c, []));
series.get('/get-news', (c) => stdRes(c, []));
series.get('/get-squads', (c) => stdRes(c, []));
series.get('/get-players', (c) => stdRes(c, []));
series.get('/get-venues', (c) => stdRes(c, []));
series.get('/get-points-table', (c) => stdRes(c, []));
series.get('/get-stats-filters', (c) => stdRes(c, []));
series.get('/get-stats', (c) => stdRes(c, []));

export default series;
