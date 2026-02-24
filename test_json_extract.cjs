const fs = require('fs');
const html = fs.readFileSync('clean.html', 'utf8');

// The most reliable way to get Cricbuzz data is parsing the React hydration state
const startStr = 'window.__INITIAL_STATE__=';
const startIdx = html.indexOf(startStr);

if (startIdx !== -1) {
    const jsonStart = startIdx + startStr.length;
    const scriptEnd = html.indexOf('</script>', jsonStart);
    let jsonString = html.substring(jsonStart, scriptEnd).trim();
    if (jsonString.endsWith(';')) jsonString = jsonString.slice(0, -1);

    try {
        const state = JSON.parse(jsonString);
        let count = 0;

        // Cricbuzz structure: state.match.liveMatches (array of series) -> seriesMatches (array of sub-series/matches) -> matches
        const liveSeries = state.match?.liveMatches || [];
        liveSeries.forEach(series => {
            (series.seriesMatches || []).forEach(sm => {
                (sm.matches || []).forEach(m => {
                    const mInfo = m.matchInfo;
                    if (mInfo) {
                        count++;
                        console.log(`[${mInfo.matchId}] ${mInfo.team1?.teamName} vs ${mInfo.team2?.teamName} | Status: ${mInfo.state}`);
                    }
                });
            });
        });

        console.log(`Total live matches extracted logically: ${count}`);
    } catch (e) {
        console.error('JSON parse error:', e.message);
    }
} else {
    console.log('INITIAL_STATE not found in clean.html');
}
