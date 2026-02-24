/**
 * AXEVORA RELAY SCRAPER v18 (Visual Recovery)
 * Loose Regex Ingestion - Fallback Strategy for Missing Images
 */

const INGESTION_ENDPOINT = process.env.INGESTION_ENDPOINT || 'https://cricbuzz-api-v2.axevoracric.workers.dev/api/v1/ingest/push';
const INGESTION_TOKEN = process.env.INGESTION_TOKEN || 'axevora_test_secret_123';

const TARGET_URLS = [
    'https://www.cricbuzz.com/cricket-match/live-scores',
    'https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches'
];

async function fetchFromUrl(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });
        return await response.text();
    } catch (e) { return ''; }
}

async function scrapeAll() {
    const allMatches = [];
    const seenIds = new Set();

    for (const url of TARGET_URLS) {
        const html = await fetchFromUrl(url);
        if (!html) continue;

        // LOOSE REGEX: Just find Match IDs and nearby Team data
        const matchRegex = /matchId\\?":(\d+)/g;
        let m;
        while ((m = matchRegex.exec(html)) !== null) {
            const id = m[1];
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            // Extract a window of text around the matchId
            const window = html.substring(m.index, m.index + 2000);

            const teamARegex = /team1\\?":{.*?teamName\\?":\\?"(.*?)\\?".*?imageId\\?":(\d+)/;
            const teamBRegex = /team2\\?":{.*?teamName\\?":\\?"(.*?)\\?".*?imageId\\?":(\d+)/;

            const tA = window.match(teamARegex) || [];
            const tB = window.match(teamBRegex) || [];

            if (tA[1] || tB[1]) {
                allMatches.push({
                    id: `relay:${id}`,
                    source: 'relay',
                    source_match_id: id,
                    team_a: (tA[1] || 'TBA').replace(/\\/g, ''),
                    team_a_img: tA[2] || '',
                    team_b: (tB[1] || 'TBA').replace(/\\/g, ''),
                    team_b_img: tB[2] || '',
                    status: url.includes('upcoming') ? 'scheduled' : 'live',
                    start_time: Math.floor(Date.now() / 1000),
                    provider_updated_at: Math.floor(Date.now() / 1000),
                    squads: { team_a: [], team_b: [] },
                    lineups: { team_a: [], team_b: [] },
                    live_details: {},
                    scorecard: []
                });
            }
        }
    }

    console.log(`[Relay] Final count: ${allMatches.length}`);
    return allMatches;
}

async function run() {
    console.log(`[Relay] Starting scrape v18...`);
    const matches = await scrapeAll();
    if (matches.length === 0) {
        console.log('[Relay] No matches found. Check regex.');
        return;
    }

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
        console.error('[Relay] Ingestion Failed:', e.message);
    }
}

run();
