export const CACHE_VERSION = 'v1';

export const KV_KEYS = {
    LIVE_MATCHES: `${CACHE_VERSION}:live_matches`,
    MATCH: (id: string) => `${CACHE_VERSION}:match:${id}`,
    INGESTION_LOCK: `${CACHE_VERSION}:cron:ingestion_lock`,
    SOURCE_COOLDOWN: (name: string) => `${CACHE_VERSION}:cooldown:${name}`,
    LAST_SOURCE_INDEX: `${CACHE_VERSION}:cron:last_source_index`
};

export const TTL = {
    LIVE: 60, // seconds
    UPCOMING: 120, // seconds
    STALE_GRACE: 86400 * 2 // 2 days for individual matches
};
