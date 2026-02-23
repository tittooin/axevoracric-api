/**
 * AXEVORA RELAY SCRAPER (Zero-Budget Production Ready)
 * This script runs on GitHub Actions and pushes real-time data to your Worker API.
 */

const INGESTION_ENDPOINT = process.env.INGESTION_ENDPOINT || 'https://cricbuzz-api-v2.axevoracric.workers.dev/api/v1/ingest/push';
const INGESTION_TOKEN = process.env.INGESTION_TOKEN || 'axevora_test_secret_123';

async function fetchCricbuzzLive() {
    console.log('[Relay] Fetching Cricbuzz Live Scores...');
    try {
        const response = await fetch('https://www.cricbuzz.com/cricket-match/live-scores', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });

        const html = await response.text();
        console.log(`[Relay] HTML Length: ${html.length}`);

        // Strategy 1: Look for common match links in HTML
        const idRegex = /\/live-cricket-scores\/(\d+)/g;
        const foundIds = new Set();
        let idMatch;
        while ((idMatch = idRegex.exec(html)) !== null) {
            foundIds.add(idMatch[1]);
        }

        console.log(`[Relay] Found match-like IDs in links: ${Array.from(foundIds).join(', ')}`);

        // Strategy 2: React Chunk Regex
        const matches = [];
        const matchRegex = /"matchId":(\d+),"seriesId":\d+,"seriesName":"([^"]+)","matchDesc":"([^"]+)","matchFormat":"([^"]+)"/g;

        let match;
        while ((match = matchRegex.exec(html)) !== null) {
            const [_, id, series, desc, format] = match;
            if (matches.find(m => m.source_match_id === id)) continue;

            matches.push({
                id: `relay:${id}`,
                source: 'relay',
                source_match_id: id,
                team_a: 'Live Match',
                team_b: 'Loading...',
                status: 'live',
                start_time: Math.floor(Date.now() / 1000),
                provider_updated_at: Math.floor(Date.now() / 1000),
                squads: JSON.stringify({ team_a: [], team_b: [] }),
                lineups: JSON.stringify({ team_a: [], team_b: [] }),
                raw_payload: JSON.stringify({ series, desc, format, source: 'react_chunk' })
            });
        }

        // Strategy 3: Link Fallback
        if (matches.length === 0 && foundIds.size > 0) {
            console.log(`[Relay] Falling back to link-based skeletons.`);
            for (const id of foundIds) {
                matches.push({
                    id: `relay:${id}`,
                    source: 'relay',
                    source_match_id: id,
                    team_a: 'Live Match',
                    team_b: 'Updating...',
                    status: 'live',
                    start_time: Math.floor(Date.now() / 1000),
                    provider_updated_at: Math.floor(Date.now() / 1000),
                    squads: JSON.stringify({ team_a: [], team_b: [] }),
                    lineups: JSON.stringify({ team_a: [], team_b: [] }),
                    raw_payload: JSON.stringify({ note: "Link-based fallback", source: 'html_links' })
                });
            }
        }

        console.log(`[Relay] Total matches prepared for ingestion: ${matches.length}`);
        return matches;

    } catch (error) {
        console.error('[Relay Error]:', error);
        return [];
    }
}

async function run() {
    const matches = await fetchCricbuzzLive();

    if (matches.length === 0) {
        console.log('[Relay] No matches found, skipping push.');
        return;
    }

    console.log(`[Relay] Pushing ${matches.length} matches to Worker...`);

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
}

run();
