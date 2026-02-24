import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/auth';
import { rateLimitAndQuota } from '../middlewares/rateLimiter';

const stdRes = (c: any, data: any) => c.json({ success: true, data });

const news = new Hono();
news.use('*', authMiddleware, rateLimitAndQuota);
news.get('/list', (c) => stdRes(c, []));
news.get('/detail', (c) => stdRes(c, []));
news.get('/get-categories', (c) => stdRes(c, []));
news.get('/list-by-category', (c) => stdRes(c, []));
news.get('/get-topics', (c) => stdRes(c, []));
news.get('/list-by-topic', (c) => stdRes(c, []));

const stats = new Hono();
stats.use('*', authMiddleware, rateLimitAndQuota);
stats.get('/get-icc-rankings', (c) => stdRes(c, []));
stats.get('/get-icc-standings', (c) => stdRes(c, []));
stats.get('/get-record-filters', (c) => stdRes(c, []));
stats.get('/get-records', (c) => stdRes(c, []));

const venues = new Hono();
venues.use('*', authMiddleware, rateLimitAndQuota);
venues.get('/get-info', (c) => stdRes(c, []));
venues.get('/get-stats', (c) => stdRes(c, []));
venues.get('/get-matches', (c) => stdRes(c, []));

export { news, stats, venues };
