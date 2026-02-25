/**
 * AXEVORA RELAY SCRAPER v28 (Registry Engine Pro)
 * Robust TeamID grouping to resolve team mixing and staff inclusion.
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
    if (!html) return { teams: {}, authorizedIds: [] };

    console.log(`[Relay] Parsing squads for ${matchId}...`);

    // Combine hydration chunks - NEW ROBUST METHOD
    let combined = "";
    const pushMatches = [...html.matchAll(/self\.__next_f\.push\(\[\d+,\"(.*?)\"\]\)/gs)];
    pushMatches.forEach(m => {
        combined += m[1];
    });

    if (!combined) {
        // Fallback for single script format
        const nextData = html.match(/<script id=\"__NEXT_DATA__\" type=\"application\/json\">(.*?)<\/script>/);
        if (nextData) combined = nextData[1];
    }

    const clean = combined.replace(/\\/g, '');
    console.log(`[Relay] Cleaned length: ${clean.length}`);

    // 1. Resolve Authorized TeamIDs from matchInfo
    const matchInfoRegex = new RegExp(`"matchId":${matchId},.*?team1":\\{"teamId":(\\d+).*?team2":\\{"teamId":(\\d+)`, 's');
    const matchInfoMatch = clean.match(matchInfoRegex);
    const authorizedIds = matchInfoMatch ? [matchInfoMatch[1], matchInfoMatch[2]] : [];
    console.log(`[Relay] Authorized IDs for ${matchId}:`, authorizedIds);

    // 2. Extract Team Names Map
    const teamNamesMap = {};
    const teamRegex = /"teamId":(\d+),"teamName":"([^"]+)"/g;
    let t;
    while ((t = teamRegex.exec(clean)) !== null) {
        teamNamesMap[t[1]] = t[2];
    }

    // 3. Extract Players & Assign by TeamID
    const squadsByTeam = {};
    const playerRegex = /\{"id":(\d+),"name":"([^"]+)"/g;
    let p;
    let pFound = 0;
    while ((p = playerRegex.exec(clean)) !== null) {
        pFound++;
        const id = p[1];
        const name = p[2];
        const pObj = clean.substring(p.index, p.index + 1500);

        const teamMatch = pObj.match(/"teamId":(\d+)/);
        const roleMatch = pObj.match(/"role":"([^"]+)"/);
        const imgMatch = pObj.match(/"imageId":(\d+)/);

        const tid = teamMatch ? teamMatch[1] : null;
        const role = roleMatch ? roleMatch[1] : '';

        // Authorization Filter
        if (!tid || (authorizedIds.length > 0 && !authorizedIds.includes(tid))) continue;

        // Staff Filter
        if (/Coach|Manager|Physio|Staff|Ref|Analyst/.test(role)) continue;

        if (!squadsByTeam[tid]) squadsByTeam[tid] = { name: teamNamesMap[tid] || '', players: [] };

        // De-dupe
        if (!squadsByTeam[tid].players.some(pl => pl.id === id)) {
            squadsByTeam[tid].players.push({
                id,
                name,
                role,
                imgId: imgMatch ? imgMatch[1] : id
            });
        }
    }
    console.log(`[Relay] Processed ${pFound} players. Squads:`, Object.keys(squadsByTeam).map(tid => `${teamNamesMap[tid]}:${squadsByTeam[tid].players.length}`));

    return { teams: squadsByTeam, authorizedIds };
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
            const authIds = squadData.authorizedIds;

            if (authIds.length === 2) {
                const nameA = m.team_a.toLowerCase();
                const squads = squadData.teams;

                const findBestId = (search) => {
                    return authIds.find(id => {
                        const tName = (squads[id]?.name || '').toLowerCase();
                        return tName.includes(search.substring(0, 5)) || search.includes(tName.substring(0, 5));
                    });
                };

                const idA = findBestId(nameA);
                const idB = authIds.find(id => id !== idA);

                if (idA) m.squads.team_a = squads[idA]?.players || [];
                if (idB) m.squads.team_b = squads[idB]?.players || [];
            }

            // Deep Data
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
            console.error(`[Relay] Match ${m.source_match_id} Error:`, e.message);
        }
    }

    console.log(`[Relay] Final: ${allMatches.length}`);
    return allMatches;
}

async function run() {
    console.log(`[Relay] Starting scrape v28...`);
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
