/**
 * AXEVORA RELAY SCRAPER v26 (Industrial Elite v2)
 * High-Precision TeamID Grouping & Abbreviation Mapping.
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
    if (!html) return { teams: {} };

    // Combine hydration chunks
    const pushRegex = /self\.__next_f\.push\(\[\d+,\"([^\"]*)\"\]\)/g;
    let combined = "";
    let m;
    while ((m = pushRegex.exec(html)) !== null) combined += m[1];
    const clean = combined.replace(/\\/g, '');

    // SCRUBBER: Find the squad data segment ONLY (look for "playing XI" and "bench")
    const pXiMarkers = [...clean.matchAll(/"playing XI":/g)];
    // We take the last one or the one with "bench" nearby (match strip usually doesn't have "bench")
    const squadBlockStart = pXiMarkers.filter(m => clean.substring(m.index, m.index + 5000).includes('"bench":')).pop()?.index || 0;
    const activeBlock = clean.substring(squadBlockStart);

    // 1. Precise Team Metadata Extraction
    const teamMetadata = {};
    const teamFullNames = {};
    const teamSNames = {};
    // Look for "team":{...} blocks
    const teamBlockRegex = /"teamId":(\d+),"teamName":"([^"]+)","teamSName":"([^"]+)"/g;
    let t;
    while ((t = teamBlockRegex.exec(activeBlock)) !== null) {
        const tid = t[1];
        teamFullNames[tid] = t[2];
        teamSNames[tid] = t[3];
        teamMetadata[tid] = { fullName: t[2], shortName: t[3] };
    }

    // 2. Surgical Player Extraction
    const squadsByTeam = {};
    // Find each player object start
    const playerIndices = [...activeBlock.matchAll(/\{"id":(\d+),"name":"([^"]+)"/g)];

    for (let i = 0; i < playerIndices.length; i++) {
        const start = playerIndices[i].index;
        const end = playerIndices[i + 1] ? playerIndices[i + 1].index : activeBlock.length;
        const pObj = activeBlock.substring(start, Math.min(start + 1500, end)); // Player objects are usually small

        const id = playerIndices[i][1];
        const name = playerIndices[i][2];

        // Exact Role and TeamID from WITHIN this object
        const roleMatch = pObj.match(/"role":"([^"]+)"/);
        const teamMatch = pObj.match(/"teamId":(\d+)/);
        const imgMatch = pObj.match(/"imageId":(\d+)/);

        const role = roleMatch ? roleMatch[1] : '';
        const teamId = teamMatch ? teamMatch[1] : null;

        // FILTER: Skip non-players (Coaches, staff)
        if (!role || /Coach|Manager|Physio|Staff|Ref|Analyst/.test(role)) continue;
        if (!teamId) continue;

        if (!squadsByTeam[teamId]) squadsByTeam[teamId] = { name: teamFullNames[teamId] || teamSNames[teamId] || '', players: [] };

        // De-dupe by ID
        if (!squadsByTeam[teamId].players.find(pl => pl.id === id)) {
            squadsByTeam[teamId].players.push({
                id,
                name,
                role,
                imgId: imgMatch ? imgMatch[1] : id
            });
        }
    }

    return { teams: squadsByTeam, metadata: teamMetadata };
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
        const match = allMatches[i];
        try {
            const squadData = await fetchSquads(match.source_match_id);
            const availableTeamIds = Object.keys(squadData.teams);

            if (availableTeamIds.length > 0) {
                const mA = match.team_a.toLowerCase();
                const mB = match.team_b.toLowerCase();

                // MAPPING 3.0: Check full name, short name, and prefix
                const mapping = { a: null, b: null };
                availableTeamIds.forEach(tid => {
                    const meta = squadData.metadata[tid] || { fullName: '', shortName: '' };
                    const fName = (meta.fullName || '').toLowerCase();
                    const sName = (meta.shortName || '').toLowerCase();

                    if (mA.includes(fName.substring(0, 5)) || fName.includes(mA.substring(0, 5)) || mA === sName || sName === mA) {
                        mapping.a = tid;
                    } else if (mB.includes(fName.substring(0, 5)) || fName.includes(mB.substring(0, 5)) || mB === sName || sName === mB) {
                        mapping.b = tid;
                    }
                });

                if (mapping.a) match.squads.team_a = squadData.teams[mapping.a].players;
                if (mapping.b) match.squads.team_b = squadData.teams[mapping.b].players;
            }

            // Scorecard & Comm
            const scData = await fetchJson(`https://www.cricbuzz.com/api/mcenter/scorecard/${match.source_match_id}`);
            const commData = await fetchJson(`https://www.cricbuzz.com/api/mcenter/comm/${match.source_match_id}`);

            if (scData && scData.scoreCard) {
                match.scorecard = scData.scoreCard.map(inn => ({
                    name: (inn.batTeamDetails?.batTeamName || 'Unknown') + ' Innings',
                    batters: Object.values(inn.batTeamDetails?.batsmenData || {}).map(b => ({ id: String(b.batId), name: b.batName, dismissal: b.outDesc || 'not out', runs: String(b.runs || '0'), balls: String(b.balls || '0'), fours: String(b.fours || '0'), sixes: String(b.sixes || '0'), imgId: String(b.batId) })),
                    bowlers: Object.values(inn.bowlTeamDetails?.bowlersData || {}).map(bo => ({ id: String(bo.bowlId), name: bo.bowlName, overs: String(bo.overs || '0'), wickets: String(bo.wickets || '0'), imgId: String(bo.bowlId) }))
                }));
            }

            if (commData && commData.miniscore) {
                const mini = commData.miniscore;
                match.live_details = {
                    score: `${mini.batTeamShortName || ''} ${mini.batTeam?.teamScore || '0'}-${mini.batTeam?.teamWkts || '0'} (${mini.overs || ''})`.trim(),
                    status: mini.status || commData.matchHeader?.status || '',
                    batsmen: [mini.batsmanStriker, mini.batsmanNonStriker].filter(Boolean).map(b => ({ id: String(b.id), name: b.name, runs: String(b.runs || '0'), balls: String(b.balls || '0'), imgId: String(b.id) })),
                    bowlers: []
                };
            }

            const played = new Set();
            match.scorecard.forEach(inn => {
                inn.batters.forEach(b => played.add(b.id));
                inn.bowlers.forEach(bo => played.add(bo.id));
            });

            match.lineups = {
                team_a: match.squads.team_a.filter(p => played.has(p.id)).map(p => ({ ...p, status: 'In' })),
                team_b: match.squads.team_b.filter(p => played.has(p.id)).map(p => ({ ...p, status: 'In' }))
            };
        } catch (e) {
            console.error(`[Relay] Error match ${match.source_match_id}:`, e.message);
        }
    }

    console.log(`[Relay] Final count: ${allMatches.length}`);
    return allMatches;
}

async function run() {
    console.log(`[Relay] Starting scrape v26...`);
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
