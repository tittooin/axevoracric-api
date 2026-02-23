/**
 * AXEVORA RELAY SCRAPER (Zero-Budget Production Ready)
 * This script runs on GitHub Actions and pushes real-time data to your Worker API.
 */

const INGESTION_ENDPOINT = process.env.INGESTION_ENDPOINT || 'https://cricbuzz-api-v2.axevoracric.workers.dev/api/v1/ingest/push';
const INGESTION_TOKEN = process.env.INGESTION_TOKEN || 'axevora_test_secret_123';

const TARGET_URLS = [
    'https://www.cricbuzz.com/cricket-match/live-scores',
    'https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches',
    'https://www.cricbuzz.com/cricket-schedule'
];

async function fetchFromUrl(url) {
    console.log(`[Relay] Fetching: ${url}`);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });
        return await response.text();
    } catch (e) {
        console.error(`[Relay] Failed to fetch ${url}:`, e.message);
        return '';
    }
}

async function scrapeAll() {
    const allMatches = [];
    const seenIds = new Set();

    for (const url of TARGET_URLS) {
        const html = await fetchFromUrl(url);
        if (!html) continue;

        // Extract matches from <a title="..." href="/live-cricket-scores/..." tags
        // Cricbuzz SPA encodes match info in the title attributes of links
        const regex = /<a title="([^"]+?)\s+vs\s+([^"]+?),\s*(.*?)"[^>]+href="\/live-cricket-scores\/(\d+)\//g;
        let match;

        while ((match = regex.exec(html)) !== null) {
            const teamA = match[1].trim();
            const teamB = match[2].trim();
            const stateDesc = match[3].trim().toLowerCase();
            const id = match[4];

            if (seenIds.has(id)) continue;
            seenIds.add(id);

            let status = 'live';
            if (stateDesc.includes('preview') || stateDesc.includes('upcoming')) {
                status = 'scheduled';
            } else if (stateDesc.includes('result') || stateDesc.includes('complete') || stateDesc.includes('won') || stateDesc.includes('stumps')) {
                status = 'completed';
            }

            allMatches.push({
                id: `relay:${id}`,
                source: 'relay',
                source_match_id: id,
                team_a: teamA,
                team_b: teamB,
                status: status,
                start_time: Math.floor(Date.now() / 1000),
                provider_updated_at: Math.floor(Date.now() / 1000),
                squads: JSON.stringify({ team_a: [], team_b: [] }),
                lineups: JSON.stringify({ team_a: [], team_b: [] }),
                raw_payload: JSON.stringify({ url, source: 'relay_v4', fetched_at: new Date().toISOString() })
            });
        }
    }

    console.log(`[Relay] Total unique matches prepared: ${allMatches.length}`);
    return allMatches;
}

async function run() {
    const matches = await scrapeAll();

    if (matches.length === 0) {
        console.log('[Relay] No matches found, skipping push.');
        return;
    }

    console.log(`[Relay] Pushing ${matches.length} matches to Worker...`);

    try {
        const response = await fetch(INGESTION_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${INGESTION_TOKEN}`
            },
            body: JSON.stringify({ matches })
        });

        const result = await response.json();
        console.log('[Relay Result]:', result);
    } catch (e) {
        console.error('[Relay Result Failed]:', e.message);
    }
}

run();
