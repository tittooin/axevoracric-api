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

        // Extract every match-like ID from links
        const idRegex = /(?:\/live-cricket-scores\/|\/cricket-scores\/|\/live-cricket-scorecard\/|\/cricket-match\/)(\d+)/g;
        let idMatch;
        while ((idMatch = idRegex.exec(html)) !== null) {
            const id = idMatch[1];
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            // Order-independent JSON extraction via string slicing
            const idIndex = html.indexOf(`"matchId":${id}`);
            let teamA = 'Live Match', teamB = 'Updating...', status = 'live';

            if (idIndex !== -1) {
                const block = html.slice(idIndex, idIndex + 1500); // Grab enough text to find elements

                const t1Match = /"team1":{[^}]*"teamName":"([^"]+)"/.exec(block);
                const t2Match = /"team2":{[^}]*"teamName":"([^"]+)"/.exec(block);
                const stateMatch = /"state":"([^"]+)"/.exec(block);

                if (t1Match) teamA = t1Match[1];
                if (t2Match) teamB = t2Match[1];

                if (stateMatch) {
                    const state = stateMatch[1].toLowerCase();
                    if (['preview', 'upcoming', 'scheduled'].includes(state)) {
                        status = 'scheduled';
                    } else if (['complete', 'result'].includes(state)) {
                        status = 'completed';
                    } else {
                        status = 'live';
                    }
                }
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
