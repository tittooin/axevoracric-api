import { NormalizedMatch, normalizeMatch } from '../utils/normalize';
import { KV_KEYS, TTL } from '../utils/kv';

export async function ingestMatches(
    db: D1Database,
    kv: KVNamespace,
    results: { matches: any[]; priority: number; source?: string; name?: string }[]
) {
    const now = Math.floor(Date.now() / 1000);
    const statements = [];
    const allMatches: NormalizedMatch[] = [];

    const stats = {
        totalIngested: 0,
        refusedByFreshness: 0,
        refusedByStatusRegression: 0
    };

    for (const res of results) {
        for (const raw of res.matches) {
            const match = normalizeMatch(raw, raw.source || res.source || res.name || 'unknown');
            allMatches.push(match);

            // Hardening: Truncate raw payload to 10KB
            const safePayload = match.raw_payload && match.raw_payload.length > 10240
                ? match.raw_payload.substring(0, 10240) + '...[truncated]'
                : match.raw_payload;

            statements.push(
                db.prepare(`
            INSERT INTO matches (
                id, source, source_match_id, team_a, team_b, status, start_time, 
                last_updated, raw_payload, provider_updated_at, ingested_at, source_priority,
                squads, lineups, scorecard, live_details
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, source_match_id) DO UPDATE SET
              team_a = excluded.team_a,
              team_b = excluded.team_b,
              status = excluded.status,
              start_time = excluded.start_time,
              last_updated = excluded.last_updated,
              raw_payload = excluded.raw_payload,
              provider_updated_at = excluded.provider_updated_at,
              ingested_at = excluded.ingested_at,
              source_priority = excluded.source_priority,
              squads = CASE 
                WHEN json_extract(excluded.squads, '$.team_a') <> '[]' THEN excluded.squads 
                ELSE matches.squads 
              END,
              lineups = CASE 
                WHEN json_extract(excluded.lineups, '$.team_a') <> '[]' THEN excluded.lineups 
                ELSE matches.lineups 
              END,
              scorecard = CASE 
                WHEN excluded.scorecard IS NOT NULL AND excluded.scorecard <> '{}' THEN excluded.scorecard 
                ELSE matches.scorecard 
              END,
              live_details = CASE 
                WHEN excluded.live_details IS NOT NULL AND excluded.live_details <> '{}' THEN excluded.live_details 
                ELSE matches.live_details 
              END
            WHERE (
                -- Elite Freshness Guard (Rule: Fresher wins OR (Equal age AND higher priority wins))
                (excluded.provider_updated_at > matches.provider_updated_at) OR
                (excluded.provider_updated_at = matches.provider_updated_at AND excluded.source_priority < matches.source_priority)
            ) AND NOT (
                -- Elite Status Regression Guard (Rule: NEVER live -> scheduled)
                matches.status = 'live' AND excluded.status = 'scheduled'
            )
          `).bind(
                    match.id,
                    match.source,
                    match.source_match_id,
                    match.team_a,
                    match.team_b,
                    match.status,
                    match.start_time,
                    now,
                    safePayload || null,
                    match.provider_updated_at,
                    now,
                    res.priority,
                    match.squads || null,
                    match.lineups || null,
                    match.scorecard || null,
                    match.live_details || null
                )
            );
        }
    }

    // Execute in batch
    if (statements.length > 0) {
        console.log(`[Ingestion] Executing batch of ${statements.length} SQL statements...`);
        const batchResults = await db.batch(statements);
        console.log(`[Ingestion] Batch execution complete.`);
        // Stats calculation is simplified as D1 doesn't easily return row-matched vs row-updated in batch results 
        // without separate SELECTs. We optimize for performance here.
    }

    const liveMatches = allMatches.filter(m => m.status === 'live');

    // Hot Cache Update (Resilient to KV Limits)
    try {
        if (liveMatches.length > 0) {
            await kv.put(KV_KEYS.LIVE_MATCHES, JSON.stringify(liveMatches), { expirationTtl: TTL.LIVE });
        }

        for (const match of allMatches) {
            const ttl = match.status === 'live' ? TTL.LIVE : TTL.UPCOMING;
            await kv.put(KV_KEYS.MATCH(match.id), JSON.stringify(match), { expirationTtl: ttl });
        }
    } catch (e) {
        console.warn(`[Ingestion] Hot cache update failed (likely KV limits), skipping...`, e);
    }

    return {
        totalSent: allMatches.length,
        liveCount: liveMatches.length,
        timestamp: now
    };
}
