/**
 * AXEVORA RELAY SCRAPER v21 (Elite Visuals & Logic)
 * Robust Squad Extraction - Handles Reversals, Truncation, and Nested Image IDs.
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
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36' }
        });
        return await response.text();
    } catch (e) { return ''; }
}

async function fetchJson(url) {
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        return await response.json();
    } catch (e) { return null; }
}

async function fetchSquads(matchId) {
    const url = `https://www.cricbuzz.com/cricket-match-squads/${matchId}`;
    const html = await fetchFromUrl(url);
    if (!html) return { team1: { name: '', players: [] }, team2: { name: '', players: [] } };

    const clean = html.replace(/\\/g, '');

    // Find all player objects
    const pRegex = /"id":(\d+),"name":"([^"]+)"/g;
    const allPlayersMap = new Map();
    let p;
    while ((p = pRegex.exec(clean)) !== null) {
        const id = p[1];
        const name = p[2];
        const window = clean.substring(p.index, p.index + 2000);

        const roleMatch = window.match(/"role":"([^"]+)"/);
        const imgMatch = window.match(/"imageId":(\d+)/);

        allPlayersMap.set(id, {
            id,
            name,
            role: roleMatch ? roleMatch[1] : '',
            imgId: imgMatch ? imgMatch[1] : id,
            index: p.index
        });
    }

    // Find Team definitions
    const t1Idx = clean.indexOf('"team1"');
    const t2Idx = clean.indexOf('"team2"');
    const nameRegex = /"teamName":"([^"]+)"/g;
    const names = [];
    let n;
    while ((n = nameRegex.exec(clean)) !== null) names.push(n[1]);

    const res = {
        team1: { name: names[0] || '', players: [] },
        team2: { name: names[1] || '', players: [] }
    };

    if (t1Idx !== -1 && t2Idx !== -1) {
        const first = t1Idx < t2Idx ? { label: 'team1', idx: t1Idx } : { label: 'team2', idx: t2Idx };
        const second = t1Idx < t2Idx ? { label: 'team2', idx: t2Idx } : { label: 'team1', idx: t1Idx };

        allPlayersMap.forEach(player => {
            if (player.index > first.idx && player.index < second.idx) {
                res[first.label].players.push(player);
            } else if (player.index > second.idx) {
                res[second.label].players.push(player);
            }
        });
    }

    // De-dupe
    const dedupe = (list) => {
        const seen = new Set();
        return list.filter(p => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
        });
    };

    res.team1.players = dedupe(res.team1.players);
    res.team2.players = dedupe(res.team2.players);

    return res;
}

async function scrapeAll() {
    const allMatches = [];
    const seenIds = new Set();

    for (const url of TARGET_URLS) {
        const html = await fetchFromUrl(url);
        if (!html) continue;

        const matchRegex = /matchId\\?":(\d+)/g;
        let m;
        while ((m = matchRegex.exec(html)) !== null) {
            const id = m[1];
            if (seenIds.has(id)) continue;
            seenIds.add(id);

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

    for (let i = 0; i < Math.min(allMatches.length, 12); i++) {
        const m = allMatches[i];
        try {
            const squadData = await fetchSquads(m.source_match_id);

            // ELITE MAPPING: Check name to prevent swap
            const t1Name = squadData.team1.name.toLowerCase();
            const mA_Name = m.team_a.toLowerCase();

            if (t1Name && (mA_Name.includes(t1Name) || t1Name.includes(mA_Name.substring(0, 5)))) {
                m.squads.team_a = squadData.team1.players;
                m.squads.team_b = squadData.team2.players;
            } else {
                m.squads.team_a = squadData.team2.players;
                m.squads.team_b = squadData.team1.players;
            }

            // Fallback for missing team images from list page
            if (!m.team_a_img && squadData.team1.imgId) m.team_a_img = squadData.team1.imgId;

            // Fetch Live Details
            const scData = await fetchJson(`https://www.cricbuzz.com/api/mcenter/scorecard/${m.source_match_id}`);
            const commData = await fetchJson(`https://www.cricbuzz.com/api/mcenter/comm/${m.source_match_id}`);

            if (scData && scData.scoreCard) {
                m.scorecard = scData.scoreCard.map(inn => ({
                    name: (inn.batTeamDetails?.batTeamName || 'Unknown') + ' Innings',
                    batters: Object.values(inn.batTeamDetails?.batsmenData || {}).map(b => ({ id: String(b.batId), name: b.batName, dismissal: b.outDesc || 'not out', runs: String(b.runs || '0'), balls: String(b.balls || '0'), fours: String(b.fours || '0'), sixes: String(b.sixes || '0'), imgId: String(b.batId) })),
                    bowlers: Object.values(inn.bowlTeamDetails?.bowlersData || {}).map(bo => ({ id: String(bo.bowlId), name: bo.bowlName, overs: String(bo.overs || '0'), wickets: String(bo.wickets || '0'), imgId: String(bo.bowlId) }))
                }));
            }

            if (commData && commData.miniscore) {
                const mini = commData.miniscore;
                m.live_details = {
                    score: `${mini.batTeamShortName || ''} ${mini.batTeam?.teamScore || '0'}-${mini.batTeam?.teamWkts || '0'} (${mini.overs || ''})`.trim(),
                    status: mini.status || commData.matchHeader?.status || '',
                    batsmen: [mini.batsmanStriker, mini.batsmanNonStriker].filter(Boolean).map(b => ({ id: String(b.id), name: b.name, runs: String(b.runs || '0'), balls: String(b.balls || '0'), imgId: String(b.id) })),
                    bowlers: []
                };
            }

            const played = new Set();
            m.scorecard.forEach(inn => {
                inn.batters.forEach(b => played.add(b.id));
                inn.bowlers.forEach(bo => played.add(bo.id));
            });

            m.lineups = {
                team_a: m.squads.team_a.filter(p => played.has(p.id)).map(p => ({ ...p, status: 'In' })),
                team_b: m.squads.team_b.filter(p => played.has(p.id)).map(p => ({ ...p, status: 'In' }))
            };
        } catch (e) {
            console.error(`[Relay] Error processing match ${m.source_match_id}:`, e.message);
        }
    }

    console.log(`[Relay] Final count: ${allMatches.length}`);
    return allMatches;
}

async function run() {
    console.log(`[Relay] Starting scrape v21...`);
    try {
        const matches = await scrapeAll();
        if (matches.length === 0) return;

        const response = await fetch(INGESTION_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${INGESTION_TOKEN}` },
            body: JSON.stringify({ matches })
        });
        const result = await response.json();
        console.log('[Relay Result]:', result);
    } catch (e) {
        console.error('[Relay] Runner Global Error:', e.message);
    }
}

run();
