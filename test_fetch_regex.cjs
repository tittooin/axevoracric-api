async function testFetch() {
    const res = await fetch('https://www.cricbuzz.com/cricket-match/live-scores', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        }
    });
    const html = await res.text();

    // Instead of looking for match IDs first, let's just find ALL match blocks in the giant JSON object!
    // Cricbuzz puts matches in `type` or `matchInfo` objects.
    // Let's use a regex to find ANY JSON object that has matchId, team1, team2, etc.

    const matches = [];
    const seenIds = new Set();

    // Match anything that looks like: {"matchId":1234,"seriesId":...,"team1":{"teamName":"..."}
    // We can just extract all "matchInfo" or similar blocks.
    const matchBlockRegex = /"match[A-Za-z]*":({[^}]+?"matchId":\d+[^}]+?"team1":{[^}]+?}[^}]+?"team2":{[^}]+?}[^}]*?})/g;

    const altRegex = /{"matchId":(\d+),.*?"team1":{[^}]*"teamName":"([^"]+)",.*?"team2":{[^}]*"teamName":"([^"]+)",.*?"state":"([^"]+)"/g;

    let m;
    let count = 0;
    while ((m = altRegex.exec(html)) !== null) {
        count++;
        console.log(`[${m[1]}] ${m[2]} vs ${m[3]} | ${m[4]}`);
    }

    console.log(`Total extracted with altRegex: ${count}`);
}

testFetch();
