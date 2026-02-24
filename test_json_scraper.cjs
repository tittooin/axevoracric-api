const https = require('https');

https.get('https://www.cricbuzz.com/cricket-match/live-scores', (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
        // Let's find window.__INITIAL_STATE__
        const startIdx = data.indexOf('window.__INITIAL_STATE__=');
        if (startIdx !== -1) {
            const jsonStart = data.indexOf('{', startIdx);
            const scriptEnd = data.indexOf('</script>', jsonStart);
            let jsonString = data.substring(jsonStart, scriptEnd).trim();
            // remove trailing semicolon if exists
            if (jsonString.endsWith(';')) {
                jsonString = jsonString.slice(0, -1);
            }

            try {
                const state = JSON.parse(jsonString);
                // Look into state.match object which holds matches
                if (state.match && state.match.matches) {
                    const matches = state.match.matches;
                    console.log(`Found ${matches.length} matches in JSON!`);

                    matches.forEach(m => {
                        const mInfo = m.matchInfo;
                        console.log(`[${mInfo.matchId}] ${mInfo.team1?.teamName} vs ${mInfo.team2?.teamName} | ${mInfo.state}`);
                    });
                } else if (state.match && state.match.liveMatches) {
                    const seriesArray = state.match.liveMatches || [];
                    seriesArray.forEach(series => {
                        if (series.seriesMatches) {
                            series.seriesMatches.forEach(sm => {
                                if (sm.matches) {
                                    sm.matches.forEach(m => {
                                        const mInfo = m.matchInfo || m;
                                        console.log(`[${mInfo.matchId}] ${mInfo.team1?.teamName} vs ${mInfo.team2?.teamName} | ${mInfo.state}`);
                                    });
                                }
                            });
                        }
                    });
                } else {
                    console.log('JSON structure:', Object.keys(state.match || state));
                    console.log('Full Match Keys:', Object.keys(state.match || {}));
                }
            } catch (e) {
                console.log('JSON Parse Error', e.message);
                // Print a small snippet to see why it failed
                console.log(jsonString.substring(jsonString.length - 100));
            }
        } else {
            console.log('No INITIAL_STATE found');
        }
    });
});
