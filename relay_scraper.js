/**
 * AXEVORA RELAY SCRAPER v14 (Fantasy Hardened)
 * 100% JSON-Based Extraction Logic - Support for Fantasy Points & Playing XI
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            }
        });
        return await response.text();
    } catch (e) {
        return '';
    }
}

async function fetchJson(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        return null;
    }
}

async function fetchSquads(matchId) {
    const url = `https://www.cricbuzz.com/cricket-match-squads/${matchId}`;
    const html = await fetchFromUrl(url);
    if (!html) return { team_a: [], team_b: [] };
    const squads = { team_a: [], team_b: [] };

    const parts = html.split('class="w-1/2"');
    if (parts.length < 3) return squads;

    const extractPlayers = (segment) => {
        const players = [];
        const playerRegex = /<span>([^<]+)<\/span>[\s\S]*?<div class="text-cbTxtSec text-xs">([^<]+)<\/div>/g;
        let p;
        while ((p = playerRegex.exec(segment)) !== null) {
            const name = p[1].trim();
            const role = p[2].trim();
            if (name.length > 2 && name.length < 40 && !name.includes('(')) {
                players.push({ name, role });
            }
        }
        return players;
    };
    squads.team_a = extractPlayers(parts[1]);
    squads.team_b = extractPlayers(parts[2]);
    return squads;
}

async function fetchDeepData(matchId) {
    const liveDetails = {
        score: '',
        status: '',
        batsmen: [],
        bowlers: [],
        recent_balls: '',
        last_wicket: ''
    };
    const scorecard = [];
    const lineups = { team_a_ids: [], team_b_ids: [] };

    // --- STEP 1: Comm API (for Lineups and Mini-score) ---
    const commData = await fetchJson(`https://www.cricbuzz.com/api/mcenter/comm/${matchId}`);
    if (commData && commData.miniscore) {
        const mini = commData.miniscore;
        const batTeamShort = mini.batTeamShortName || (commData.matchHeader?.team1?.id === mini.batTeam?.teamId ? commData.matchHeader.team1.shortName : commData.matchHeader?.team2?.shortName) || 'Team';

        liveDetails.score = `${batTeamShort || ''} ${mini.batTeam?.teamScore || '0'}-${mini.batTeam?.teamWkts || '0'} (${mini.overs || mini.bowlerStriker?.overs || ''})`.replace(/\s+/g, ' ').trim();
        liveDetails.status = mini.status || commData.matchHeader?.status || '';

        if (mini.batsmanStriker) {
            liveDetails.batsmen.push({
                name: mini.batsmanStriker.name,
                runs: String(mini.batsmanStriker.runs || '0'),
                balls: String(mini.batsmanStriker.balls || '0'),
                fours: String(mini.batsmanStriker.fours || '0'),
                sixes: String(mini.batsmanStriker.sixes || '0')
            });
        }
        if (mini.batsmanNonStriker) {
            liveDetails.batsmen.push({
                name: mini.batsmanNonStriker.name,
                runs: String(mini.batsmanNonStriker.runs || '0'),
                balls: String(mini.batsmanNonStriker.balls || '0'),
                fours: String(mini.batsmanNonStriker.fours || '0'),
                sixes: String(mini.batsmanNonStriker.sixes || '0')
            });
        }
    }

    // --- STEP 2: Scorecard API (Full Details & Stats) ---
    const scData = await fetchJson(`https://www.cricbuzz.com/api/mcenter/scorecard/${matchId}`);
    if (scData && scData.scoreCard && Array.isArray(scData.scoreCard)) {
        scData.scoreCard.forEach(inn => {
            const inning = {
                name: (inn.batTeamDetails?.batTeamName || 'Unknown') + ' Innings',
                batters: [],
                bowlers: [],
                extras: inn.extrasData?.total || '0'
            };

            // Batsmen Data
            if (inn.batTeamDetails?.batsmenData) {
                Object.values(inn.batTeamDetails.batsmenData).forEach(b => {
                    inning.batters.push({
                        name: b.batName,
                        dismissal: b.outDesc || 'not out',
                        runs: String(b.runs || '0'),
                        balls: String(b.balls || '0'),
                        fours: String(b.fours || '0'),
                        sixes: String(b.sixes || '0'),
                        sr: String(b.strikeRate || '0.0'),
                        wicketCode: b.wicketCode || ''
                    });
                });
            }

            // Bowlers Data
            if (inn.bowlTeamDetails?.bowlersData) {
                Object.values(inn.bowlTeamDetails.bowlersData).forEach(bo => {
                    inning.bowlers.push({
                        name: bo.bowlName,
                        overs: String(bo.overs || '0'),
                        maidens: String(bo.maidens || '0'),
                        runs: String(bo.runs || '0'),
                        wickets: String(bo.wickets || '0'),
                        eco: String(bo.economy || '0.0')
                    });
                });
            }
            scorecard.push(inning);
        });
    }

    return { liveDetails, scorecard };
}

async function scrapeAll() {
    const allMatches = [];
    const seenIds = new Set();

    for (const url of TARGET_URLS) {
        const html = await fetchFromUrl(url);
        if (!html) continue;

        const scriptPatterns = [
            /matchId\\":(\d+),.*?team1\\":\{.*?teamName\\":\\"(.*?)\\",.*?team2\\":\{.*?teamName\\":\\"(.*?)\\"/g,
            /matchId":(\d+),.*?"team1":\{.*?"teamName":"(.*?)",.*?"team2":\{.*?"teamName":"(.*?)"/g
        ];

        let foundCount = 0;
        for (const pattern of scriptPatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                const id = match[1];
                if (seenIds.has(id)) continue;
                seenIds.add(id);

                const teamA = match[2].replace(/\\/g, '').trim();
                const teamB = match[3].replace(/\\/g, '').trim();
                let status = url.includes('upcoming') ? 'scheduled' : 'live';

                allMatches.push({
                    id: `relay:${id}`,
                    source: 'relay',
                    source_match_id: id,
                    team_a: teamA,
                    team_b: teamB,
                    status: status,
                    start_time: Math.floor(Date.now() / 1000),
                    provider_updated_at: Math.floor(Date.now() / 1000),
                    squads: { team_a: [], team_b: [] },
                    lineups: { team_a: [], team_b: [] },
                    live_details: {},
                    scorecard: []
                });
                foundCount++;
            }
        }
        console.log(`[Relay] Discovered ${foundCount} matches from ${url}`);
    }

    // Now fetch deep data for top 5 matches
    for (let i = 0; i < Math.min(allMatches.length, 15); i++) {
        const m = allMatches[i];
        m.squads = await fetchSquads(m.source_match_id);

        if (i < 5) {
            const deep = await fetchDeepData(m.source_match_id);
            m.live_details = deep.liveDetails;
            m.scorecard = deep.scorecard;

            // Inferred Lineups from Scorecard (Confirmed players)
            const playedA = new Set();
            const playedB = new Set();
            m.scorecard.forEach(inn => {
                const isTeamAInnings = inn.name.includes(m.team_a);
                inn.batters.forEach(b => (isTeamAInnings ? playedA : playedB).add(b.name));
                inn.bowlers.forEach(bo => (isTeamAInnings ? playedB : playedA).add(bo.name));
            });
            m.lineups = {
                team_a: Array.from(playedA).map(name => ({ name, status: 'In' })),
                team_b: Array.from(playedB).map(name => ({ name, status: 'In' }))
            };

            // Force status 'completed' if scorecard has 2+ innings and match header says result
            if (m.scorecard.length >= 2 && m.live_details.status.toLowerCase().includes('won')) {
                m.status = 'completed';
            }
        }
    }

    console.log(`[Relay] Final count: ${allMatches.length}`);
    return allMatches;
}

async function run() {
    console.log(`[Relay] Starting scrape...`);
    const matches = await scrapeAll();
    if (matches.length === 0) return;

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
