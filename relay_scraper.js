/**
 * AXEVORA RELAY SCRAPER v31 (Anchor Engine)
 * Anchors on "playing XI" to find the real squad section,
 * then carves strict team1/team2 segments from that window.
 */

const INGESTION_ENDPOINT = process.env.INGESTION_ENDPOINT || 'https://cricbuzz-api-v2.axevoracric.workers.dev/api/v1/ingest/push';
const INGESTION_TOKEN = process.env.INGESTION_TOKEN || 'axevora_test_secret_123';

async function getHtml(url) {
    try {
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
        return await r.text();
    } catch { return ''; }
}

async function getJson(url) {
    try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        return await r.json();
    } catch { return null; }
}

/** Properly unescape Next.js hydration chunks. */
function extractHydration(html) {
    const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
    let m, combined = '';
    while ((m = re.exec(html)) !== null) {
        try { combined += JSON.parse('"' + m[1] + '"'); }
        catch { combined += m[1]; }
    }
    return combined;
}

/** Extract players from a segment string (playing XI + bench content). */
function parsePlayers(segStr) {
    if (!segStr) return [];
    const players = [];
    const re = /"id":(\d+),"name":"([^"]+)"/g;
    let m;
    while ((m = re.exec(segStr)) !== null) {
        const id = m[1];
        const name = m[2];
        const chunk = segStr.substring(m.index, m.index + 600);
        const roleM = chunk.match(/"role":"([^"]+)"/);
        const imgM = chunk.match(/"imageId":(\d+)/);
        const role = roleM ? roleM[1] : '';
        if (/Coach|Manager|Physio|Staff|Analyst|Referee|Umpire/.test(role)) continue;
        if (!players.find(p => p.id === id)) {
            players.push({ id, name, role, imgId: imgM ? imgM[1] : id });
        }
    }
    return players;
}

/**
 * Fetch squads by anchoring on "playing XI" — this key ONLY appears in the
 * real squad section, never in the live-scores sidebar matchesList.
 * Then find the nearest team1/team2 markers within that window.
 */
async function fetchSquads(matchId) {
    const html = await getHtml(`https://www.cricbuzz.com/cricket-match-squads/${matchId}`);
    if (!html) return { team_a: [], team_b: [] };

    const hyd = extractHydration(html);

    // Find first "playing XI" — the anchor into real squad data
    const pXiIdx = hyd.indexOf('"playing XI"');
    if (pXiIdx === -1) {
        console.log(`[Relay] ${matchId}: no playing XI`);
        return { team_a: [], team_b: [] };
    }

    // Carve a window around squad data: go back 20k to capture team headers,
    // forward 80k to include bench + team2 data.
    const winStart = Math.max(0, pXiIdx - 20000);
    const win = hyd.substring(winStart, pXiIdx + 80000);

    // Find team1 and team2 markers within the window.
    // We want the LAST "team1":{ that appears before the first "playing XI".
    const localPXi = pXiIdx - winStart;
    const t1Hits = [...win.matchAll(/"team1":\{/g)].map(m => m.index);
    const t1Before = t1Hits.filter(i => i < localPXi);
    const t1Start = t1Before.length ? t1Before[t1Before.length - 1] : t1Hits[0];

    if (t1Start === undefined) {
        console.log(`[Relay] ${matchId}: no team1 marker near playing XI`);
        return { team_a: [], team_b: [] };
    }

    // team2 starts after team1
    const t2Start = win.indexOf('"team2":{', t1Start + 1);

    // Strict segments
    const team1Seg = t2Start !== -1
        ? win.substring(t1Start, t2Start)
        : win.substring(t1Start, t1Start + 40000);
    const team2Seg = t2Start !== -1
        ? win.substring(t2Start, t2Start + 40000)
        : '';

    const t1P = team1Seg.match(/"playing XI":\[(.*?)\]/s);
    const t1B = team1Seg.match(/"bench":\[(.*?)\]/s);
    const t2P = team2Seg.match(/"playing XI":\[(.*?)\]/s);
    const t2B = team2Seg.match(/"bench":\[(.*?)\]/s);

    const teamA = parsePlayers((t1P?.[1] ?? '') + (t1B?.[1] ?? ''));
    const teamB = parsePlayers((t2P?.[1] ?? '') + (t2B?.[1] ?? ''));

    console.log(`[Relay] ${matchId} -> A:${teamA.length} B:${teamB.length}`);
    return { team_a: teamA, team_b: teamB };
}

/** Extract match list from the main live/upcoming page. */
function extractMatchList(html, isUpcoming) {
    const hyd = extractHydration(html);
    const matches = [];
    const seen = new Set();

    const re = /"matchId":(\d+),/g;
    let m;
    while ((m = re.exec(hyd)) !== null) {
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);

        const win = hyd.substring(m.index, m.index + 3000);
        const t1 = win.match(/"team1":\{"teamId":\d+,"teamName":"([^"]+)"/);
        const t2 = win.match(/"team2":\{"teamId":\d+,"teamName":"([^"]+)"/);
        const i1 = win.match(/"team1":\{[^}]*?"imageId":(\d+)/);
        const i2 = win.match(/"team2":\{[^}]*?"imageId":(\d+)/);

        if (!t1 || !t2) continue;

        matches.push({
            id: `relay:${id}`,
            source: 'relay',
            source_match_id: id,
            team_a: t1[1],
            team_a_img: i1?.[1] ?? '',
            team_b: t2[1],
            team_b_img: i2?.[1] ?? '',
            status: isUpcoming ? 'scheduled' : 'live',
            start_time: Math.floor(Date.now() / 1000),
            provider_updated_at: Math.floor(Date.now() / 1000),
            squads: { team_a: [], team_b: [] },
            lineups: { team_a: [], team_b: [] },
            live_details: {},
            scorecard: []
        });
    }
    console.log(`[Relay] ${isUpcoming ? 'Upcoming' : 'Live'}: ${matches.length}`);
    return matches;
}

async function run() {
    console.log('[Relay] v31 (Anchor Engine) starting...');

    const all = [];
    const seen = new Set();

    for (const [url, isUpcoming] of [
        ['https://www.cricbuzz.com/cricket-match/live-scores', false],
        ['https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches', true]
    ]) {
        const html = await getHtml(url);
        for (const match of extractMatchList(html, isUpcoming)) {
            if (!seen.has(match.id)) { seen.add(match.id); all.push(match); }
        }
    }

    console.log(`[Relay] Total unique: ${all.length}`);

    for (let i = 0; i < Math.min(all.length, 12); i++) {
        const match = all[i];
        try {
            match.squads = await fetchSquads(match.source_match_id);

            const sc = await getJson(`https://www.cricbuzz.com/api/mcenter/scorecard/${match.source_match_id}`);
            if (sc?.scoreCard) {
                match.scorecard = sc.scoreCard.map(inn => ({
                    name: (inn.batTeamDetails?.batTeamName ?? 'Unknown') + ' Innings',
                    batters: Object.values(inn.batTeamDetails?.batsmenData ?? {}).map(b => ({
                        id: String(b.batId), name: b.batName,
                        dismissal: b.outDesc || 'not out',
                        runs: String(b.runs ?? 0), balls: String(b.balls ?? 0),
                        fours: String(b.fours ?? 0), sixes: String(b.sixes ?? 0),
                        imgId: String(b.batId)
                    })),
                    bowlers: Object.values(inn.bowlTeamDetails?.bowlersData ?? {}).map(bo => ({
                        id: String(bo.bowlId), name: bo.bowlName,
                        overs: String(bo.overs ?? 0), wickets: String(bo.wickets ?? 0),
                        imgId: String(bo.bowlId)
                    }))
                }));
            }

            const comm = await getJson(`https://www.cricbuzz.com/api/mcenter/comm/${match.source_match_id}`);
            if (comm?.miniscore) {
                const mini = comm.miniscore;
                match.live_details = {
                    score: `${mini.batTeamShortName ?? ''} ${mini.batTeam?.teamScore ?? 0}-${mini.batTeam?.teamWkts ?? 0} (${mini.overs ?? ''})`.trim(),
                    status: mini.status || comm.matchHeader?.status || '',
                    batsmen: [mini.batsmanStriker, mini.batsmanNonStriker]
                        .filter(Boolean)
                        .map(b => ({ id: String(b.id), name: b.name, runs: String(b.runs ?? 0), balls: String(b.balls ?? 0), imgId: String(b.id) })),
                    bowlers: []
                };
            }

            const played = new Set([
                ...match.scorecard.flatMap(inn => inn.batters.map(b => b.id)),
                ...match.scorecard.flatMap(inn => inn.bowlers.map(b => b.id))
            ]);
            match.lineups = {
                team_a: match.squads.team_a.filter(p => played.has(p.id)).map(p => ({ ...p, status: 'In' })),
                team_b: match.squads.team_b.filter(p => played.has(p.id)).map(p => ({ ...p, status: 'In' }))
            };

        } catch (e) {
            console.error(`[Relay] ${match.source_match_id}:`, e.message);
        }
    }

    if (all.length === 0) { console.log('[Relay] Nothing to ingest.'); return; }

    const resp = await fetch(INGESTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${INGESTION_TOKEN}` },
        body: JSON.stringify({ matches: all })
    });
    const result = await resp.json();
    console.log('[Relay Result]:', result);
}

run().catch(e => console.error('[Relay] Fatal:', e.message));
