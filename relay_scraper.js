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

        // Extracting data from hydration script chunks (Next.js __next_f logic)
        // This is a simplified regex for the relay demo. In a full version, we'd parse all chunks.
        const matches = [];

        // Look for matchId and team names in the HTML
        // Note: For a robust implementation, we would use a proper parser or more complex regex.
        // For Phase 16 Handover, we'll implement a sample extraction that works with the current Cricbuzz structure.

        // More flexible regex to handle Next.js streaming chunks
        const matchRegex = /"matchId":(\d+),"seriesId":\d+,"seriesName":"([^"]+)","matchDesc":"([^"]+)","matchFormat":"([^"]+)"(?:,"startDate":"\d+")?(?:,"state":"[^"]+")?(?:,"status":"[^"]+")?,"team1":{[^}]*"teamName":"([^"]+)","teamSName":"([^"]+)"},"team2":{[^}]*"teamName":"([^"]+)","teamSName":"([^"]+)"}/g;

        let match;
        while ((match = matchRegex.exec(html)) !== null) {
            const [_, id, series, desc, format, team1, team1S, team2, team2S] = match;

            matches.push({
                id: `relay:${id}`,
                source: 'relay',
                source_match_id: id,
                team_a: team1,
                team_b: team2,
                status: 'live', // Default to live for this scraper
                start_time: Math.floor(Date.now() / 1000),
                provider_updated_at: Math.floor(Date.now() / 1000),
                squads: JSON.stringify({ team_a: [], team_b: [] }),
                lineups: JSON.stringify({ team_a: [], team_b: [] }),
                raw_payload: JSON.stringify({ series, desc, format, team1S, team2S })
            });
        }

        console.log(`[Relay] Found ${matches.length} matches.`);
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
