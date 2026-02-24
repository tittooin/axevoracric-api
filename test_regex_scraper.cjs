const https = require('https');

https.get('https://www.cricbuzz.com/cricket-match/live-scores', (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
        const id = '117047'; // Test with this ID

        let foundAny = false;

        // Let's find ALL occurrences of this match ID
        let searchStr = `"matchId":${id}`;
        let startIdx = 0;
        let count = 0;

        while ((startIdx = data.indexOf(searchStr, startIdx)) !== -1) {
            count++;
            console.log(`\n\n--- Occurrence ${count} at index ${startIdx} ---`);
            const snippet = data.substring(startIdx - 10, startIdx + 800);

            // Check if this snippet has team1
            const hasTeam1 = snippet.includes('"team1"');
            console.log(`Has team1? ${hasTeam1}`);

            if (hasTeam1) {
                foundAny = true;
                const t1 = /"team1":\s*{[^}]*"teamName":\s*"([^"]+)"/.exec(snippet);
                const t2 = /"team2":\s*{[^}]*"teamName":\s*"([^"]+)"/.exec(snippet);

                // Let's also try to extract state from this SAME snippet
                const stateMatch = /"state":\s*"([^"]+)"/.exec(snippet);

                console.log('Extracted T1:', t1 ? t1[1] : 'FAIL');
                console.log('Extracted T2:', t2 ? t2[1] : 'FAIL');
                console.log('Extracted State:', stateMatch ? stateMatch[1] : 'FAIL');
            } else {
                console.log(`Snippet starts with: ${snippet.substring(0, 50)}...`);
            }

            startIdx += searchStr.length;
        }

        if (!foundAny) {
            console.log('\n\nWait, NONE of the occurrences had team1? Let me just search for teamName then.');
            const t1Idx = data.indexOf('"teamName"');
            console.log('First teamName at', t1Idx, 'snippet:', data.substring(t1Idx, t1Idx + 100));
        }
    });
});
