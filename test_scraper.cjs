const https = require('https');

https.get('https://www.cricbuzz.com/cricket-match/live-scores', (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
        // Let's find match 117047 which was in the Live section
        const id = '117047'; /* Change to a live match id from UI if 117047 is no longer there */

        // Find all occurrences of matchId:id
        const regex = new RegExp(`"matchId":(\\d+)`, 'g');
        let match;
        const matchesSeen = new Set();
        while ((match = regex.exec(data)) !== null) {
            const currentId = match[1];
            if (matchesSeen.has(currentId)) continue;
            matchesSeen.add(currentId);

            console.log(`\n\n--- Testing matchId: ${currentId} ---`);

            // Try different extraction strategies here to see what works
            // Strategy 1: Find {"matchId":currentId,...} block
            const blockRegex = new RegExp(`{"matchId":${currentId},.*?(?={"matchId":|]$|}})}`, 'g');
            const blockMatch = blockRegex.exec(data);

            if (blockMatch) {
                const block = blockMatch[0];
                const t1Match = /"team1":{[^}]*"teamName":"([^"]+)"/.exec(block);
                const t2Match = /"team2":{[^}]*"teamName":"([^"]+)"/.exec(block);
                const stateMatch = /"state":"([^"]+)"/.exec(block);

                console.log('Team 1:', t1Match ? t1Match[1] : 'NOT FOUND');
                console.log('Team 2:', t2Match ? t2Match[1] : 'NOT FOUND');
                console.log('State:', stateMatch ? stateMatch[1] : 'NOT FOUND');
            } else {
                console.log("Could not find block for", currentId);
            }
        }
    });
});
